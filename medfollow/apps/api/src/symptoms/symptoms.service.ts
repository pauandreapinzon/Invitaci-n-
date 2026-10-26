import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SignalSource } from '@prisma/client';
import { SYMPTOM_BY_CODE, SYMPTOM_CATALOG, Vitals } from '@medfollow/clinical-engine';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RiskService } from '../risk/risk.service';
import { AlertsService } from '../alerts/alerts.service';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { CreateSymptomDto } from './dto/create-symptom.dto';

/**
 * Registro manual de sintomas y signos por parte del equipo clinico
 * (por ejemplo durante una llamada de enfermeria). Toda escritura vuelve a
 * correr el motor de riesgo, igual que un mensaje del paciente.
 */
@Injectable()
export class SymptomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly risk: RiskService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return SYMPTOM_CATALOG;
  }

  async create(dto: CreateSymptomDto, user: RequestUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, hospitalId: user.hospitalId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    if (dto.code && !SYMPTOM_BY_CODE[dto.code]) {
      throw new BadRequestException(`El codigo ${dto.code} no existe en el catalogo clinico`);
    }
    if (!dto.code && !dto.vitals && dto.missedDoses === undefined) {
      throw new BadRequestException('Debe registrar al menos un sintoma, un signo vital o la adherencia');
    }

    const plan = await this.risk.getActivePlan(dto.patientId);
    const source = user.role === 'DOCTOR' ? SignalSource.DOCTOR : SignalSource.NURSE;

    await this.risk.persistSignals(
      dto.patientId,
      {
        symptoms: dto.code
          ? [
              {
                code: dto.code,
                present: dto.present ?? true,
                severity: dto.severity,
                trend: dto.trend,
                onsetDays: dto.onsetDays,
                quote: dto.note,
              },
            ]
          : [],
        vitals: (dto.vitals ?? {}) as Vitals,
        adherence:
          dto.missedDoses !== undefined
            ? { missedDoses: dto.missedDoses, totalDoses: dto.totalDoses ?? Math.max(dto.missedDoses, 1) }
            : undefined,
        source,
      },
      { planId: plan?.id },
    );

    const { evaluation, riskScoreId, patient: updatedPatient } = await this.risk.evaluate(dto.patientId);
    const alert = await this.alerts.createFromEvaluation({
      patient: updatedPatient,
      evaluation,
      riskScoreId,
      planId: plan?.id,
    });

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'SYMPTOM_REGISTERED',
      resource: 'SymptomObservation',
      patientId: dto.patientId,
      metadata: { code: dto.code ?? null, vitals: { ...(dto.vitals ?? {}) }, level: evaluation.level },
    });

    return { evaluation, alertId: alert?.id ?? null, riskScoreId };
  }

  async findForPatient(patientId: string, user: RequestUser, take = 100) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, hospitalId: user.hospitalId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const [symptoms, vitals] = await Promise.all([
      this.prisma.symptomObservation.findMany({ where: { patientId }, orderBy: { reportedAt: 'desc' }, take }),
      this.prisma.vitalReading.findMany({ where: { patientId }, orderBy: { reportedAt: 'desc' }, take }),
    ]);
    return { symptoms, vitals };
  }
}
