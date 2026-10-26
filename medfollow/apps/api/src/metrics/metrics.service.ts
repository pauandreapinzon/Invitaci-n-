import { Injectable } from '@nestjs/common';
import { AlertStatus, CheckInStatus, RiskLevel } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface OverviewMetrics {
  patients: { active: number; green: number; yellow: number; red: number };
  alerts: { open: number; red: number; yellow: number; resolved7d: number; avgTimeToAckMinutes: number | null };
  followUps: { active: number; completed: number; checkInsSent: number; checkInsAnswered: number; contactRate: number };
  adherence: { reports: number; fullAdherence: number; adherenceRate: number };
  channel: { messagesIn7d: number; messagesOut7d: number; aiGenerated: number; deterministic: number };
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  private daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  /** Indicadores de la vista principal del dashboard. */
  async overview(hospitalId: string): Promise<OverviewMetrics> {
    const last7d = this.daysAgo(7);

    const [
      activePatients,
      byRisk,
      openAlerts,
      redAlerts,
      yellowAlerts,
      resolved7d,
      ackAggregate,
      activePlans,
      completedPlans,
      checkInsSent,
      checkInsAnswered,
      adherenceEvents,
      fullAdherence,
      messagesIn,
      messagesOut,
      aiMessages,
      deterministicMessages,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { hospitalId, active: true } }),
      this.prisma.patient.groupBy({
        by: ['currentRiskLevel'],
        where: { hospitalId, active: true },
        _count: { _all: true },
      }),
      this.prisma.alert.count({ where: { hospitalId, status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.IN_PROGRESS] } } }),
      this.prisma.alert.count({ where: { hospitalId, level: RiskLevel.RED, status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.IN_PROGRESS] } } }),
      this.prisma.alert.count({ where: { hospitalId, level: RiskLevel.YELLOW, status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.IN_PROGRESS] } } }),
      this.prisma.alert.count({ where: { hospitalId, status: AlertStatus.RESOLVED, resolvedAt: { gte: last7d } } }),
      this.prisma.alert.aggregate({ where: { hospitalId, timeToAckMinutes: { not: null } }, _avg: { timeToAckMinutes: true } }),
      this.prisma.followUpPlan.count({ where: { hospitalId, status: 'ACTIVE' } }),
      this.prisma.followUpPlan.count({ where: { hospitalId, status: 'COMPLETED' } }),
      this.prisma.followUpCheckIn.count({ where: { plan: { hospitalId }, status: { in: [CheckInStatus.SENT, CheckInStatus.ANSWERED, CheckInStatus.MISSED] } } }),
      this.prisma.followUpCheckIn.count({ where: { plan: { hospitalId }, status: CheckInStatus.ANSWERED } }),
      this.prisma.adherenceEvent.count({ where: { plan: { hospitalId } } }),
      this.prisma.adherenceEvent.count({ where: { plan: { hospitalId }, missedDoses: 0 } }),
      this.prisma.message.count({ where: { conversation: { hospitalId }, direction: 'INBOUND', createdAt: { gte: last7d } } }),
      this.prisma.message.count({ where: { conversation: { hospitalId }, direction: 'OUTBOUND', createdAt: { gte: last7d } } }),
      this.prisma.message.count({ where: { conversation: { hospitalId }, author: 'AI', deterministic: false } }),
      this.prisma.message.count({ where: { conversation: { hospitalId }, deterministic: true } }),
    ]);

    const riskCount = (level: RiskLevel): number =>
      byRisk.find((row) => row.currentRiskLevel === level)?._count._all ?? 0;

    return {
      patients: {
        active: activePatients,
        green: riskCount(RiskLevel.GREEN),
        yellow: riskCount(RiskLevel.YELLOW),
        red: riskCount(RiskLevel.RED),
      },
      alerts: {
        open: openAlerts,
        red: redAlerts,
        yellow: yellowAlerts,
        resolved7d,
        avgTimeToAckMinutes: ackAggregate._avg.timeToAckMinutes ?? null,
      },
      followUps: {
        active: activePlans,
        completed: completedPlans,
        checkInsSent,
        checkInsAnswered,
        contactRate: checkInsSent ? Math.round((checkInsAnswered / checkInsSent) * 1000) / 10 : 0,
      },
      adherence: {
        reports: adherenceEvents,
        fullAdherence,
        adherenceRate: adherenceEvents ? Math.round((fullAdherence / adherenceEvents) * 1000) / 10 : 0,
      },
      channel: {
        messagesIn7d: messagesIn,
        messagesOut7d: messagesOut,
        aiGenerated: aiMessages,
        deterministic: deterministicMessages,
      },
    };
  }

  /** Serie diaria de alertas por nivel para la grafica de tendencia. */
  async alertsTimeSeries(hospitalId: string, days = 14) {
    const since = this.daysAgo(days);
    const alerts = await this.prisma.alert.findMany({
      where: { hospitalId, createdAt: { gte: since } },
      select: { createdAt: true, level: true },
    });

    const buckets = new Map<string, { date: string; RED: number; YELLOW: number; GREEN: number }>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      buckets.set(date, { date, RED: 0, YELLOW: 0, GREEN: 0 });
    }
    for (const alert of alerts) {
      const key = alert.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) bucket[alert.level] += 1;
    }
    return Array.from(buckets.values());
  }

  /** Reglas que mas se disparan: insumo para ajustar protocolos. */
  async topTriggeredRules(hospitalId: string, days = 30) {
    const since = this.daysAgo(days);
    const scores = await this.prisma.riskScore.findMany({
      where: { patient: { hospitalId }, evaluatedAt: { gte: since }, level: { in: [RiskLevel.RED, RiskLevel.YELLOW] } },
      select: { triggeredRules: true },
    });

    const counts = new Map<string, { ruleId: string; title: string; level: string; count: number }>();
    for (const score of scores) {
      const rules = (score.triggeredRules as unknown as Array<{ ruleId: string; title: string; level: string }>) ?? [];
      for (const rule of rules) {
        const current = counts.get(rule.ruleId) ?? { ruleId: rule.ruleId, title: rule.title, level: rule.level, count: 0 };
        current.count += 1;
        counts.set(rule.ruleId, current);
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }

  /** Reporte operativo del periodo, exportable para auditoria o facturacion. */
  async report(hospitalId: string, from: Date, to: Date) {
    const [plans, alerts, checkIns, riskScores] = await Promise.all([
      this.prisma.followUpPlan.count({ where: { hospitalId, createdAt: { gte: from, lte: to } } }),
      this.prisma.alert.groupBy({
        by: ['level', 'status'],
        where: { hospitalId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.followUpCheckIn.groupBy({
        by: ['status'],
        where: { plan: { hospitalId }, scheduledAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.riskScore.groupBy({
        by: ['level'],
        where: { patient: { hospitalId }, evaluatedAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    return {
      period: { from, to },
      followUpPlans: plans,
      alerts: alerts.map((a) => ({ level: a.level, status: a.status, count: a._count._all })),
      checkIns: checkIns.map((c) => ({ status: c.status, count: c._count._all })),
      riskEvaluations: riskScores.map((r) => ({ level: r.level, count: r._count._all })),
    };
  }
}
