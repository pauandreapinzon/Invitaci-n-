import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Alert, AlertStatus, EscalationChannel, Patient, Prisma, RiskLevel } from '@prisma/client';
import { RiskEvaluation } from '@medfollow/clinical-engine';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { alertPriority } from '../common/utils/clinical.util';

/** Ventana para no duplicar alertas por el mismo motivo clinico. */
const DEDUPE_WINDOW_MINUTES = 360;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Crea la alerta a partir de la evaluacion del motor determinista.
   * Si ya existe una alerta abierta por las mismas reglas en la ventana de
   * deduplicacion, se actualiza en lugar de saturar la cola de enfermeria.
   */
  async createFromEvaluation(params: {
    patient: Patient;
    evaluation: RiskEvaluation;
    riskScoreId: string;
    planId?: string | null;
  }): Promise<Alert | null> {
    const { patient, evaluation, riskScoreId, planId } = params;
    if (evaluation.level === 'GREEN' || evaluation.triggered.length === 0) return null;

    const triggeredRuleIds = evaluation.triggered.map((t) => t.ruleId).sort();
    const primary = [...evaluation.triggered].sort((a, b) => b.score - a.score)[0];
    const summary = evaluation.triggered
      .map((rule) => `${rule.title}: ${rule.evidence.join('; ')}`)
      .join(' | ');

    const since = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000);
    const existing = await this.prisma.alert.findFirst({
      where: {
        patientId: patient.id,
        status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.IN_PROGRESS] },
        level: evaluation.level as RiskLevel,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && JSON.stringify([...existing.triggeredRuleIds].sort()) === JSON.stringify(triggeredRuleIds)) {
      this.logger.log(`Alerta ${existing.id} actualizada (deduplicacion) para paciente ${patient.id}`);
      return this.prisma.alert.update({
        where: { id: existing.id },
        data: { summary, riskScoreId, updatedAt: new Date() },
      });
    }

    const alert = await this.prisma.alert.create({
      data: {
        patientId: patient.id,
        hospitalId: patient.hospitalId,
        planId: planId ?? null,
        riskScoreId,
        level: evaluation.level as RiskLevel,
        priority: alertPriority(evaluation.level),
        title: primary?.title ?? 'Senal de riesgo detectada',
        summary,
        triggeredRuleIds,
        escalation: evaluation.escalation as EscalationChannel,
      },
    });

    await this.audit.record({
      hospitalId: patient.hospitalId,
      actorType: 'SYSTEM',
      action: 'ALERT_CREATED',
      resource: 'Alert',
      resourceId: alert.id,
      patientId: patient.id,
      metadata: { level: alert.level, triggeredRuleIds, escalation: alert.escalation },
    });

    this.logger.warn(`Alerta ${alert.level} creada para paciente ${patient.id} (${alert.title})`);
    return alert;
  }

  /**
   * Alerta operativa (no clinica): solicitud de contacto humano, paciente no
   * contactable o retiro de consentimiento. No proviene del motor de reglas.
   */
  async createOperational(params: {
    patient: Patient;
    level: RiskLevel;
    title: string;
    summary: string;
    escalation?: EscalationChannel;
    planId?: string | null;
    ruleId?: string;
  }): Promise<Alert> {
    const alert = await this.prisma.alert.create({
      data: {
        patientId: params.patient.id,
        hospitalId: params.patient.hospitalId,
        planId: params.planId ?? null,
        level: params.level,
        priority: alertPriority(params.level),
        title: params.title,
        summary: params.summary,
        triggeredRuleIds: params.ruleId ? [params.ruleId] : [],
        escalation: params.escalation ?? EscalationChannel.NURSE_QUEUE,
      },
    });
    await this.audit.record({
      hospitalId: params.patient.hospitalId,
      actorType: 'SYSTEM',
      action: 'ALERT_CREATED_OPERATIONAL',
      resource: 'Alert',
      resourceId: alert.id,
      patientId: params.patient.id,
      metadata: { title: params.title, level: params.level },
    });
    return alert;
  }

  async findAll(query: QueryAlertsDto, user: RequestUser) {
    const where: Prisma.AlertWhereInput = {
      hospitalId: user.hospitalId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.level ? { level: query.level } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: query.take ?? 25,
        skip: query.skip ?? 0,
        include: {
          patient: { select: { id: true, fullName: true, currentRiskLevel: true, currentRiskScore: true, birthDate: true } },
          assignedTo: { select: { id: true, fullName: true } },
          plan: { select: { id: true, diagnosisText: true, protocolCode: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(id: string, user: RequestUser) {
    const alert = await this.prisma.alert.findFirst({
      where: { id, hospitalId: user.hospitalId },
      include: {
        patient: true,
        riskScore: true,
        plan: { include: { medications: true } },
        acknowledgedBy: { select: { id: true, fullName: true } },
        resolvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!alert) throw new NotFoundException('Alerta no encontrada');

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'ALERT_READ',
      resource: 'Alert',
      resourceId: id,
      patientId: alert.patientId,
    });
    return alert;
  }

  async acknowledge(id: string, user: RequestUser) {
    const alert = await this.prisma.alert.findFirst({ where: { id, hospitalId: user.hospitalId } });
    if (!alert) throw new NotFoundException('Alerta no encontrada');

    const now = new Date();
    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedAt: alert.acknowledgedAt ?? now,
        acknowledgedById: alert.acknowledgedById ?? user.id,
        assignedToId: alert.assignedToId ?? user.id,
        timeToAckMinutes:
          alert.timeToAckMinutes ?? Math.round((now.getTime() - alert.createdAt.getTime()) / 60000),
      },
    });

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'ALERT_ACKNOWLEDGED',
      resource: 'Alert',
      resourceId: id,
      patientId: alert.patientId,
      metadata: { timeToAckMinutes: updated.timeToAckMinutes },
    });
    return updated;
  }

  async resolve(id: string, resolutionNote: string, user: RequestUser) {
    const alert = await this.prisma.alert.findFirst({ where: { id, hospitalId: user.hospitalId } });
    if (!alert) throw new NotFoundException('Alerta no encontrada');

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: user.id,
        resolutionNote,
      },
    });

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'ALERT_RESOLVED',
      resource: 'Alert',
      resourceId: id,
      patientId: alert.patientId,
    });
    return updated;
  }

  async assign(id: string, assigneeId: string, user: RequestUser) {
    const alert = await this.prisma.alert.findFirst({ where: { id, hospitalId: user.hospitalId } });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    const assignee = await this.prisma.user.findFirst({ where: { id: assigneeId, hospitalId: user.hospitalId } });
    if (!assignee) throw new NotFoundException('Usuario asignado no encontrado');

    const updated = await this.prisma.alert.update({
      where: { id },
      data: { assignedToId: assigneeId, status: AlertStatus.IN_PROGRESS },
    });
    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'ALERT_ASSIGNED',
      resource: 'Alert',
      resourceId: id,
      patientId: alert.patientId,
      metadata: { assigneeId },
    });
    return updated;
  }

  /** Conteo por nivel y estado para los indicadores del dashboard. */
  async queueSummary(hospitalId: string) {
    const grouped = await this.prisma.alert.groupBy({
      by: ['level', 'status'],
      where: { hospitalId },
      _count: { _all: true },
    });
    return grouped.map((row) => ({ level: row.level, status: row.status, count: row._count._all }));
  }
}
