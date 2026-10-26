import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Patient, Prisma, RiskLevel } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AuditService } from '../common/audit/audit.service';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { ageInYears } from '../common/utils/clinical.util';

export interface PatientView {
  id: string;
  fullName: string;
  documentType: string;
  documentId?: string;
  phone?: string;
  phoneMasked: string;
  birthDate: Date | null;
  ageYears: number;
  sex: string | null;
  pregnant: boolean;
  comorbidities: string[];
  currentRiskLevel: RiskLevel;
  currentRiskScore: number;
  lastContactAt: Date | null;
  active: boolean;
  createdAt: Date;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Proyeccion del paciente para el dashboard.
   * Los datos de contacto solo se devuelven en claro cuando el consumidor los
   * necesita (detalle de paciente), y ese acceso queda auditado.
   */
  toView(patient: Patient, options: { revealContact?: boolean } = {}): PatientView {
    const phone = this.encryption.decrypt(patient.phoneEnc);
    return {
      id: patient.id,
      fullName: patient.fullName,
      documentType: patient.documentType,
      documentId: options.revealContact ? this.encryption.decrypt(patient.documentIdEnc) : undefined,
      phone: options.revealContact ? phone : undefined,
      phoneMasked: this.encryption.maskPhone(phone),
      birthDate: patient.birthDate,
      ageYears: ageInYears(patient.birthDate),
      sex: patient.sex,
      pregnant: patient.pregnant,
      comorbidities: patient.comorbidities,
      currentRiskLevel: patient.currentRiskLevel,
      currentRiskScore: patient.currentRiskScore,
      lastContactAt: patient.lastContactAt,
      active: patient.active,
      createdAt: patient.createdAt,
    };
  }

  async create(dto: CreatePatientDto, user: RequestUser): Promise<PatientView> {
    const normalizedPhone = this.encryption.normalizePhone(dto.phone);
    const phoneHash = this.encryption.hash(normalizedPhone);

    const existing = await this.prisma.patient.findUnique({
      where: { hospitalId_phoneHash: { hospitalId: user.hospitalId, phoneHash } },
    });
    if (existing) {
      throw new ConflictException('Ya existe un paciente con ese telefono en el hospital');
    }

    const patient = await this.prisma.patient.create({
      data: {
        hospitalId: user.hospitalId,
        fullName: dto.fullName.trim(),
        documentType: dto.documentType ?? 'CC',
        documentIdEnc: this.encryption.encrypt(dto.documentId.trim()),
        phoneEnc: this.encryption.encrypt(normalizedPhone),
        phoneHash,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        sex: dto.sex ?? null,
        pregnant: dto.pregnant ?? false,
        comorbidities: dto.comorbidities ?? [],
        createdById: user.id,
      },
    });

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'PATIENT_CREATE',
      resource: 'Patient',
      resourceId: patient.id,
      patientId: patient.id,
    });

    return this.toView(patient);
  }

  async findAll(query: QueryPatientsDto, user: RequestUser) {
    const where: Prisma.PatientWhereInput = {
      hospitalId: user.hospitalId,
      active: true,
      ...(query.riskLevel ? { currentRiskLevel: query.riskLevel } : {}),
      ...(query.search ? { fullName: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy: [{ currentRiskScore: 'desc' }, { lastContactAt: 'desc' }],
        take: query.take ?? 25,
        skip: query.skip ?? 0,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items: patients.map((p) => this.toView(p)), total };
  }

  async findOne(id: string, user: RequestUser, options: { revealContact?: boolean } = {}) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, hospitalId: user.hospitalId },
      include: {
        plans: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { medications: true, doctor: { select: { id: true, fullName: true } }, checkIns: { orderBy: { dayOffset: 'asc' } } },
        },
        riskScores: { orderBy: { evaluatedAt: 'desc' }, take: 10 },
        alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
        symptoms: { orderBy: { reportedAt: 'desc' }, take: 40 },
        vitals: { orderBy: { reportedAt: 'desc' }, take: 40 },
        consents: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: options.revealContact ? 'PATIENT_READ_CONTACT' : 'PATIENT_READ',
      resource: 'Patient',
      resourceId: patient.id,
      patientId: patient.id,
    });

    return {
      ...this.toView(patient, options),
      plans: patient.plans,
      riskScores: patient.riskScores,
      alerts: patient.alerts,
      symptoms: patient.symptoms,
      vitals: patient.vitals,
      consents: patient.consents,
    };
  }

  async update(id: string, dto: UpdatePatientDto, user: RequestUser): Promise<PatientView> {
    const patient = await this.prisma.patient.findFirst({ where: { id, hospitalId: user.hospitalId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const data: Prisma.PatientUpdateInput = {
      ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
      ...(dto.documentType ? { documentType: dto.documentType } : {}),
      ...(dto.documentId ? { documentIdEnc: this.encryption.encrypt(dto.documentId.trim()) } : {}),
      ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}),
      ...(dto.sex ? { sex: dto.sex } : {}),
      ...(dto.pregnant !== undefined ? { pregnant: dto.pregnant } : {}),
      ...(dto.comorbidities ? { comorbidities: dto.comorbidities } : {}),
    };

    if (dto.phone) {
      const normalizedPhone = this.encryption.normalizePhone(dto.phone);
      data.phoneEnc = this.encryption.encrypt(normalizedPhone);
      data.phoneHash = this.encryption.hash(normalizedPhone);
    }

    const updated = await this.prisma.patient.update({ where: { id }, data });
    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'PATIENT_UPDATE',
      resource: 'Patient',
      resourceId: id,
      patientId: id,
      metadata: { fields: Object.keys(data) },
    });
    return this.toView(updated);
  }

  /** Registro crudo del paciente dentro del hospital del usuario. */
  async getEntity(id: string, hospitalId: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({ where: { id, hospitalId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  /** Busqueda por telefono usada por el webhook de WhatsApp (seudonimizada). */
  async findByPhone(phone: string): Promise<Patient | null> {
    const phoneHash = this.encryption.hash(this.encryption.normalizePhone(phone));
    return this.prisma.patient.findFirst({
      where: { phoneHash, active: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async touchLastContact(patientId: string): Promise<void> {
    await this.prisma.patient.update({ where: { id: patientId }, data: { lastContactAt: new Date() } });
  }

  getPhone(patient: Patient): string {
    return this.encryption.decrypt(patient.phoneEnc);
  }
}
