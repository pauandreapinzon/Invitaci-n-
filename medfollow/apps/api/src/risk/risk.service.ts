import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AdherenceStatus, EscalationChannel, FollowUpPlan, Patient, Prisma, RiskLevel, SignalSource } from '@prisma/client';
import {
  AdherenceSnapshot,
  ENGINE_VERSION,
  EvaluationContext,
  ExtractedSignals,
  Protocol,
  RiskEvaluation,
  SYMPTOM_BY_CODE,
  Severity,
  SymptomObservation,
  Trend,
  Vitals,
  evaluateRisk,
  explainEvaluation,
} from '@medfollow/clinical-engine';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProtocolsService } from '../protocols/protocols.service';
import { AuditService } from '../common/audit/audit.service';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { ageInYears, followUpDay } from '../common/utils/clinical.util';

/** Ventana de observaciones que se considera vigente para evaluar riesgo. */
const SYMPTOM_WINDOW_HOURS = 48;
const VITALS_WINDOW_HOURS = 24;

export interface SignalsToPersist {
  symptoms: SymptomObservation[];
  vitals: Vitals;
  adherence?: AdherenceSnapshot;
  source: SignalSource;
}

export interface EvaluationOutcome {
  evaluation: RiskEvaluation;
  riskScoreId: string;
  patient: Patient;
  plan?: FollowUpPlan | null;
  protocol: Protocol;
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly protocols: ProtocolsService,
    private readonly audit: AuditService,
  ) {}

  async getActivePlan(patientId: string): Promise<FollowUpPlan | null> {
    return this.prisma.followUpPlan.findFirst({
      where: { patientId, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Persiste las senales extraidas como observaciones clinicas trazables. */
  async persistSignals(
    patientId: string,
    signals: SignalsToPersist,
    links: { messageId?: string; checkInId?: string; planId?: string },
  ): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const symptom of signals.symptoms) {
      const definition = SYMPTOM_BY_CODE[symptom.code];
      operations.push(
        this.prisma.symptomObservation.create({
          data: {
            patientId,
            checkInId: links.checkInId ?? null,
            messageId: links.messageId ?? null,
            code: symptom.code,
            label: definition?.label ?? symptom.code,
            present: symptom.present,
            severity: symptom.severity ?? null,
            trend: symptom.trend ?? null,
            onsetDays: symptom.onsetDays ?? null,
            quote: symptom.quote ?? null,
            source: signals.source,
          },
        }),
      );
    }

    const vitalUnits: Record<string, string> = {
      temperatureC: 'C',
      heartRate: 'lpm',
      respiratoryRate: 'rpm',
      spo2: '%',
      systolicBp: 'mmHg',
      diastolicBp: 'mmHg',
      glucoseMgDl: 'mg/dL',
    };
    for (const [metric, value] of Object.entries(signals.vitals)) {
      if (typeof value !== 'number') continue;
      operations.push(
        this.prisma.vitalReading.create({
          data: {
            patientId,
            messageId: links.messageId ?? null,
            metric,
            value,
            unit: vitalUnits[metric] ?? '',
            source: signals.source,
          },
        }),
      );
    }

    if (signals.adherence && links.planId) {
      const { missedDoses, totalDoses } = signals.adherence;
      operations.push(
        this.prisma.adherenceEvent.create({
          data: {
            patientId,
            planId: links.planId,
            status:
              missedDoses === 0
                ? AdherenceStatus.TAKEN
                : missedDoses >= totalDoses
                  ? AdherenceStatus.MISSED
                  : AdherenceStatus.PARTIAL,
            missedDoses,
            totalDoses,
          },
        }),
      );
    }

    if (operations.length) await this.prisma.$transaction(operations);
  }

  /**
   * Arma el contexto de evaluacion a partir del estado clinico vigente del
   * paciente: ultima observacion por sintoma, ultimo valor por signo vital,
   * adherencia reportada y dia de seguimiento.
   */
  async buildContext(patientId: string): Promise<{ context: EvaluationContext; patient: Patient; plan: FollowUpPlan | null; protocol: Protocol }> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const plan = await this.getActivePlan(patientId);
    const protocol =
      (plan ? this.protocols.getByCode(plan.protocolCode) : undefined) ??
      this.protocols.resolveForDiagnosis(plan?.diagnosisText ?? '');

    const since = new Date(Date.now() - SYMPTOM_WINDOW_HOURS * 60 * 60 * 1000);
    const observations = await this.prisma.symptomObservation.findMany({
      where: { patientId, reportedAt: { gte: since } },
      orderBy: { reportedAt: 'desc' },
    });

    const symptomsByCode = new Map<string, SymptomObservation>();
    for (const observation of observations) {
      if (symptomsByCode.has(observation.code)) continue;
      symptomsByCode.set(observation.code, {
        code: observation.code,
        present: observation.present,
        severity: (observation.severity as Severity | null) ?? undefined,
        trend: (observation.trend as Trend | null) ?? undefined,
        onsetDays: observation.onsetDays ?? undefined,
        quote: observation.quote ?? undefined,
      });
    }

    const vitalsSince = new Date(Date.now() - VITALS_WINDOW_HOURS * 60 * 60 * 1000);
    const readings = await this.prisma.vitalReading.findMany({
      where: { patientId, reportedAt: { gte: vitalsSince } },
      orderBy: { reportedAt: 'desc' },
    });
    const vitals: Vitals = {};
    for (const reading of readings) {
      const metric = reading.metric as keyof Vitals;
      if (vitals[metric] === undefined) vitals[metric] = reading.value;
    }

    let adherence: AdherenceSnapshot | undefined;
    if (plan) {
      const event = await this.prisma.adherenceEvent.findFirst({
        where: { planId: plan.id },
        orderBy: { reportedAt: 'desc' },
      });
      if (event) adherence = { missedDoses: event.missedDoses, totalDoses: event.totalDoses };
    }

    const context: EvaluationContext = {
      patient: {
        ageYears: ageInYears(patient.birthDate),
        pregnant: patient.pregnant,
        comorbidities: patient.comorbidities,
      },
      diagnosisCodes: plan ? [plan.protocolCode, plan.diagnosisCode ?? plan.diagnosisText] : [],
      symptoms: Array.from(symptomsByCode.values()),
      vitals,
      adherence,
      followUpDay: plan ? followUpDay(plan.startDate) : undefined,
    };

    return { context, patient, plan, protocol };
  }

  /**
   * Corre el motor determinista, persiste el resultado con su evidencia y
   * actualiza el semaforo del paciente.
   */
  async evaluate(patientId: string, options: { checkInId?: string } = {}): Promise<EvaluationOutcome> {
    const { context, patient, plan, protocol } = await this.buildContext(patientId);
    const evaluation = evaluateRisk(context, { protocol });

    const riskScore = await this.prisma.riskScore.create({
      data: {
        patientId,
        planId: plan?.id ?? null,
        checkInId: options.checkInId ?? null,
        level: evaluation.level as RiskLevel,
        score: evaluation.score,
        engineVersion: evaluation.engineVersion,
        protocolCode: evaluation.protocolCode ?? null,
        protocolVersion: evaluation.protocolVersion ?? null,
        escalation: evaluation.escalation as EscalationChannel,
        triggeredRules: evaluation.triggered as unknown as Prisma.InputJsonValue,
        evaluatedRuleIds: evaluation.evaluatedRuleIds,
        missingData: evaluation.missingData,
        inputSnapshot: context as unknown as Prisma.InputJsonValue,
      },
    });

    const updatedPatient = await this.prisma.patient.update({
      where: { id: patientId },
      data: { currentRiskLevel: evaluation.level as RiskLevel, currentRiskScore: evaluation.score },
    });

    await this.audit.record({
      hospitalId: patient.hospitalId,
      actorType: 'SYSTEM',
      action: 'RISK_EVALUATED',
      resource: 'RiskScore',
      resourceId: riskScore.id,
      patientId,
      metadata: {
        level: evaluation.level,
        score: evaluation.score,
        engineVersion: ENGINE_VERSION,
        triggeredRuleIds: evaluation.triggered.map((t) => t.ruleId),
      },
    });

    if (evaluation.level !== 'GREEN') {
      this.logger.warn(`Paciente ${patientId} clasificado ${evaluation.level}:\n${explainEvaluation(evaluation)}`);
    }

    return { evaluation, riskScoreId: riskScore.id, patient: updatedPatient, plan, protocol };
  }

  /** Riesgo vigente con su trazabilidad (endpoint GET /risk-score). */
  async getCurrent(patientId: string, user: RequestUser) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, hospitalId: user.hospitalId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const latest = await this.prisma.riskScore.findFirst({
      where: { patientId },
      orderBy: { evaluatedAt: 'desc' },
    });

    const { context, protocol } = await this.buildContext(patientId);

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'RISK_READ',
      resource: 'RiskScore',
      resourceId: latest?.id,
      patientId,
    });

    return {
      patientId,
      level: latest?.level ?? patient.currentRiskLevel,
      score: latest?.score ?? patient.currentRiskScore,
      engineVersion: latest?.engineVersion ?? ENGINE_VERSION,
      protocol: { code: protocol.code, name: protocol.name, version: protocol.version },
      escalation: latest?.escalation ?? 'NONE',
      triggeredRules: latest?.triggeredRules ?? [],
      missingData: latest?.missingData ?? [],
      evaluatedAt: latest?.evaluatedAt ?? null,
      currentContext: context,
    };
  }

  async history(patientId: string, user: RequestUser, take = 30) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, hospitalId: user.hospitalId } });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return this.prisma.riskScore.findMany({
      where: { patientId },
      orderBy: { evaluatedAt: 'desc' },
      take,
    });
  }

  /** Simula el motor sobre un contexto hipotetico, sin persistir (uso clinico/QA). */
  simulate(context: EvaluationContext, protocolCode?: string): RiskEvaluation {
    const protocol = protocolCode ? this.protocols.getByCode(protocolCode) : undefined;
    return evaluateRisk(context, { protocol });
  }

  toExtractedSignals(signals: ExtractedSignals): SignalsToPersist {
    return { symptoms: signals.symptoms, vitals: signals.vitals, adherence: signals.adherence, source: SignalSource.HEURISTIC };
  }
}
