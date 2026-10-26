import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CheckInStatus, ConsentStatus, FollowUpPlan, FollowUpStatus, Prisma, Role } from '@prisma/client';
import { Protocol } from '@medfollow/clinical-engine';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ProtocolsService } from '../protocols/protocols.service';
import { ConversationOrchestrator } from '../orchestrator/conversation-orchestrator.service';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { CreateFollowUpDto } from './dto/create-followup.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '../common/consent/consent.constants';

/** Hora local en la que se envian los seguimientos programados. */
const CHECK_IN_HOUR = 9;

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly protocols: ProtocolsService,
    private readonly orchestrator: ConversationOrchestrator,
    private readonly audit: AuditService,
  ) {}

  private scheduleDate(base: Date, dayOffset: number): Date {
    const date = new Date(base);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(CHECK_IN_HOUR, 0, 0, 0);
    return date;
  }

  /**
   * Crea el plan de seguimiento tras una consulta: resuelve el protocolo,
   * registra el tratamiento, agenda los contactos y abre el consentimiento.
   */
  async create(dto: CreateFollowUpDto, user: RequestUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, hospitalId: user.hospitalId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const protocol: Protocol = this.protocols.resolveForDiagnosis(
      `${dto.diagnosisCode ?? ''} ${dto.diagnosisText}`,
    );
    const consultationAt = dto.consultationAt ? new Date(dto.consultationAt) : new Date();
    const checkInDays = (dto.checkInDays?.length ? dto.checkInDays : protocol.checkInDays).slice().sort((a, b) => a - b);
    const doctorId = user.role === Role.DOCTOR ? user.id : null;

    const plan = await this.prisma.followUpPlan.create({
      data: {
        patientId: patient.id,
        hospitalId: user.hospitalId,
        doctorId,
        consultationAt,
        diagnosisText: dto.diagnosisText,
        diagnosisCode: dto.diagnosisCode ?? null,
        protocolCode: protocol.code,
        protocolVersion: protocol.version,
        instructions: dto.instructions ?? null,
        checkInDays,
        startDate: consultationAt,
        endDate: this.scheduleDate(consultationAt, (checkInDays[checkInDays.length - 1] ?? 3) + 1),
        status: FollowUpStatus.ACTIVE,
        medications: dto.medications?.length
          ? {
              create: dto.medications.map((m) => ({
                name: m.name,
                dose: m.dose,
                frequencyHours: m.frequencyHours,
                durationDays: m.durationDays,
                instructions: m.instructions ?? null,
              })),
            }
          : undefined,
        checkIns: {
          create: checkInDays.map((dayOffset) => ({
            patientId: patient.id,
            dayOffset,
            scheduledAt: this.scheduleDate(consultationAt, dayOffset),
          })),
        },
      },
      include: { medications: true, checkIns: { orderBy: { dayOffset: 'asc' } } },
    });

    // Consentimiento informado: se solicita una vez por paciente.
    const existingConsent = await this.prisma.consent.findFirst({
      where: { patientId: patient.id, status: ConsentStatus.GRANTED },
    });
    if (!existingConsent) {
      await this.prisma.consent.create({
        data: {
          patientId: patient.id,
          status: ConsentStatus.PENDING,
          textVersion: CONSENT_TEXT_VERSION,
          textSnapshot: CONSENT_TEXT,
        },
      });
    }

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'FOLLOWUP_CREATED',
      resource: 'FollowUpPlan',
      resourceId: plan.id,
      patientId: patient.id,
      metadata: { protocolCode: protocol.code, checkInDays },
    });

    // La explicacion del diagnostico (caso de uso 1) se envia al paciente.
    let welcome: { messageId?: string; text?: string } = {};
    if (dto.sendWelcome !== false) {
      welcome = await this.orchestrator.sendPlanWelcome(plan.id);
    }

    return { plan, protocol: { code: protocol.code, name: protocol.name, version: protocol.version }, welcome };
  }

  async findAll(query: PaginationDto & { patientId?: string; status?: FollowUpStatus }, user: RequestUser) {
    const where: Prisma.FollowUpPlanWhereInput = {
      hospitalId: user.hospitalId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.followUpPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.take ?? 25,
        skip: query.skip ?? 0,
        include: {
          patient: { select: { id: true, fullName: true, currentRiskLevel: true } },
          medications: true,
          checkIns: { orderBy: { dayOffset: 'asc' } },
          doctor: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.followUpPlan.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string, user: RequestUser) {
    const plan = await this.prisma.followUpPlan.findFirst({
      where: { id, hospitalId: user.hospitalId },
      include: {
        patient: true,
        medications: true,
        checkIns: { orderBy: { dayOffset: 'asc' } },
        riskScores: { orderBy: { evaluatedAt: 'desc' }, take: 10 },
        alerts: { orderBy: { createdAt: 'desc' } },
        adherence: { orderBy: { reportedAt: 'desc' }, take: 20 },
      },
    });
    if (!plan) throw new NotFoundException('Plan de seguimiento no encontrado');
    return plan;
  }

  async cancel(id: string, user: RequestUser): Promise<FollowUpPlan> {
    const plan = await this.prisma.followUpPlan.findFirst({ where: { id, hospitalId: user.hospitalId } });
    if (!plan) throw new NotFoundException('Plan de seguimiento no encontrado');

    const [updated] = await this.prisma.$transaction([
      this.prisma.followUpPlan.update({ where: { id }, data: { status: FollowUpStatus.CANCELLED } }),
      this.prisma.followUpCheckIn.updateMany({
        where: { planId: id, status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.SKIPPED },
      }),
    ]);

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'FOLLOWUP_CANCELLED',
      resource: 'FollowUpPlan',
      resourceId: id,
      patientId: plan.patientId,
    });
    return updated;
  }

  /** Dispara manualmente el contacto de un seguimiento programado. */
  async triggerCheckIn(checkInId: string, user: RequestUser) {
    const checkIn = await this.prisma.followUpCheckIn.findFirst({
      where: { id: checkInId, plan: { hospitalId: user.hospitalId } },
    });
    if (!checkIn) throw new NotFoundException('Seguimiento no encontrado');

    const result = await this.orchestrator.sendCheckIn(checkInId);
    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'CHECKIN_TRIGGERED',
      resource: 'FollowUpCheckIn',
      resourceId: checkInId,
      patientId: checkIn.patientId,
    });
    return result;
  }
}
