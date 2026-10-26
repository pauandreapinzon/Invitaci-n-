import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Channel,
  CheckInStatus,
  ConsentStatus,
  FollowUpPlan,
  FollowUpStatus,
  Medication,
  MessageAuthor,
  MessageDirection,
  Patient,
  Prisma,
  SignalSource,
} from '@prisma/client';
import { Protocol, RiskEvaluation, normalizeText, patientSafetyMessage } from '@medfollow/clinical-engine';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AiService } from '../ai/ai.service';
import { PatientBrief, ProtocolBrief } from '../ai/ai.types';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ConversationsService } from '../conversations/conversations.service';
import { PatientsService } from '../patients/patients.service';
import { ProtocolsService } from '../protocols/protocols.service';
import { RiskService } from '../risk/risk.service';
import { AlertsService } from '../alerts/alerts.service';
import {
  CONSENT_ACCEPT_WORDS,
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  CONSENT_WITHDRAW_WORDS,
} from '../common/consent/consent.constants';
import { ageInYears, firstName, isQuietHour } from '../common/utils/clinical.util';

export interface InboundResult {
  conversationId: string;
  inboundMessageId: string;
  replyMessageId?: string;
  reply?: string;
  evaluation?: RiskEvaluation;
  alertId?: string;
  intent: string;
  consentRequired: boolean;
}

export interface OutboundResult {
  messageId?: string;
  text?: string;
  skipped?: string;
}

/**
 * Orquestador conversacional: implementa la arquitectura hibrida del PRD.
 *
 *   mensaje del paciente
 *     -> capa 1 (IA): extraccion de senales clinicas
 *     -> capa 2 (motor determinista): clasificacion de riesgo y escalamiento
 *     -> respuesta al paciente (plantilla en rojo, IA en verde/amarillo)
 *
 * La IA nunca decide el nivel de alerta ni el mensaje en casos de urgencia.
 */
@Injectable()
export class ConversationOrchestrator {
  private readonly logger = new Logger(ConversationOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiService,
    private readonly whatsapp: WhatsAppService,
    private readonly conversations: ConversationsService,
    private readonly patients: PatientsService,
    private readonly protocols: ProtocolsService,
    private readonly risk: RiskService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
  ) {}

  private patientBrief(patient: Patient): PatientBrief {
    return {
      firstName: firstName(patient.fullName),
      ageYears: ageInYears(patient.birthDate),
      sex: patient.sex,
      pregnant: patient.pregnant,
      comorbidities: patient.comorbidities,
      language: patient.language,
    };
  }

  private protocolBrief(protocol: Protocol): ProtocolBrief {
    return {
      code: protocol.code,
      name: protocol.name,
      plainLanguageSummary: protocol.plainLanguageSummary,
      redFlagsForPatient: protocol.redFlagsForPatient,
    };
  }

  /** Dosis esperadas por dia segun el esquema formulado. */
  private expectedDailyDoses(medications: Medication[]): number {
    const total = medications.reduce((sum, m) => sum + Math.max(1, Math.round(24 / m.frequencyHours)), 0);
    return total > 0 ? total : 3;
  }

  private async getConsent(patientId: string) {
    return this.prisma.consent.findFirst({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async dispatch(patient: Patient, body: string, conversationId: string, meta: {
    author: MessageAuthor;
    aiModel?: string;
    aiLatencyMs?: number;
    deterministic?: boolean;
    metadata?: Prisma.InputJsonValue;
  }): Promise<string> {
    const phone = this.patients.getPhone(patient);
    let providerMessageId: string | null = null;
    try {
      const sent = await this.whatsapp.send({ to: phone, body });
      providerMessageId = sent.providerMessageId;
    } catch (error) {
      this.logger.error(`No se pudo enviar el mensaje al paciente ${patient.id}`, error as Error);
    }

    const message = await this.conversations.appendMessage({
      conversationId,
      direction: MessageDirection.OUTBOUND,
      author: meta.author,
      body,
      providerMessageId,
      aiModel: meta.aiModel ?? null,
      aiLatencyMs: meta.aiLatencyMs ?? null,
      deterministic: meta.deterministic ?? false,
      metadata: meta.metadata,
    });
    return message.id;
  }

  /**
   * Caso de uso 1: explicacion del diagnostico en lenguaje sencillo,
   * acompanada de la solicitud de consentimiento si aun no existe.
   */
  async sendPlanWelcome(planId: string): Promise<OutboundResult> {
    const plan = await this.prisma.followUpPlan.findUnique({
      where: { id: planId },
      include: { patient: true, medications: true },
    });
    if (!plan) throw new NotFoundException('Plan de seguimiento no encontrado');

    const protocol = this.protocols.getByCode(plan.protocolCode) ?? this.protocols.resolveForDiagnosis(plan.diagnosisText);
    const explanation = await this.ai.explainDiagnosis({
      diagnosisText: plan.diagnosisText,
      protocol: this.protocolBrief(protocol),
      instructions: plan.instructions,
      medications: plan.medications.map((m) => ({
        name: m.name,
        dose: m.dose,
        frequencyHours: m.frequencyHours,
        durationDays: m.durationDays,
      })),
      patient: this.patientBrief(plan.patient),
    });

    await this.prisma.followUpPlan.update({
      where: { id: plan.id },
      data: { plainLanguageExplanation: explanation.text },
    });

    const consent = await this.getConsent(plan.patientId);
    const needsConsent = !consent || consent.status !== ConsentStatus.GRANTED;
    const body = needsConsent ? `${explanation.text}\n\n${CONSENT_TEXT}` : explanation.text;

    const conversation = await this.conversations.getOrCreateOpen(
      plan.patientId,
      plan.hospitalId,
      Channel.WHATSAPP,
    );
    const messageId = await this.dispatch(plan.patient, body, conversation.id, {
      author: MessageAuthor.AI,
      aiModel: explanation.model,
      aiLatencyMs: explanation.latencyMs,
      deterministic: explanation.deterministic,
      metadata: { kind: 'PLAN_WELCOME', planId: plan.id, consentRequested: needsConsent },
    });

    await this.audit.record({
      hospitalId: plan.hospitalId,
      actorType: 'SYSTEM',
      action: 'PLAN_WELCOME_SENT',
      resource: 'FollowUpPlan',
      resourceId: plan.id,
      patientId: plan.patientId,
      metadata: { aiModel: explanation.model, consentRequested: needsConsent },
    });

    return { messageId, text: body };
  }

  /** Caso de uso 2: contacto programado de seguimiento. */
  async sendCheckIn(checkInId: string): Promise<OutboundResult> {
    const checkIn = await this.prisma.followUpCheckIn.findUnique({
      where: { id: checkInId },
      include: { patient: true, plan: { include: { medications: true } } },
    });
    if (!checkIn) throw new NotFoundException('Seguimiento no encontrado');
    if (checkIn.plan.status === FollowUpStatus.CANCELLED) return { skipped: 'plan cancelado' };

    const quietStart = this.config.get<number>('quietHours.start') ?? 21;
    const quietEnd = this.config.get<number>('quietHours.end') ?? 7;
    if (isQuietHour(new Date().getHours(), quietStart, quietEnd)) {
      return { skipped: 'horario silencioso' };
    }

    const consent = await this.getConsent(checkIn.patientId);
    if (consent?.status === ConsentStatus.WITHDRAWN) return { skipped: 'consentimiento retirado' };

    const conversation = await this.conversations.getOrCreateOpen(
      checkIn.patientId,
      checkIn.plan.hospitalId,
      Channel.WHATSAPP,
    );

    if (!consent || consent.status === ConsentStatus.PENDING) {
      const messageId = await this.dispatch(checkIn.patient, CONSENT_TEXT, conversation.id, {
        author: MessageAuthor.SYSTEM,
        deterministic: true,
        metadata: { kind: 'CONSENT_REMINDER' },
      });
      await this.prisma.followUpCheckIn.update({
        where: { id: checkInId },
        data: { status: CheckInStatus.SENT, sentAt: new Date(), attempts: { increment: 1 }, conversationId: conversation.id },
      });
      return { messageId, text: CONSENT_TEXT };
    }

    const protocol =
      this.protocols.getByCode(checkIn.plan.protocolCode) ??
      this.protocols.resolveForDiagnosis(checkIn.plan.diagnosisText);
    const { context } = await this.risk.buildContext(checkIn.patientId);
    const pending = protocol.questions.filter((q) => !q.askIf);
    const question = pending[0]?.text ?? protocol.questions[0]?.text ?? 'Como te has sentido hoy?';

    const body = `Hola ${firstName(checkIn.patient.fullName)}, soy el asistente de seguimiento del hospital. Dia ${checkIn.dayOffset} de tu seguimiento por ${checkIn.plan.diagnosisText}. ${question}`;

    const messageId = await this.dispatch(checkIn.patient, body, conversation.id, {
      author: MessageAuthor.AI,
      deterministic: true,
      metadata: { kind: 'CHECK_IN', checkInId, dayOffset: checkIn.dayOffset, knownSymptoms: context.symptoms.length },
    });

    await this.prisma.followUpCheckIn.update({
      where: { id: checkInId },
      data: {
        status: CheckInStatus.SENT,
        sentAt: new Date(),
        attempts: { increment: 1 },
        conversationId: conversation.id,
      },
    });

    await this.audit.record({
      hospitalId: checkIn.plan.hospitalId,
      actorType: 'SYSTEM',
      action: 'CHECKIN_SENT',
      resource: 'FollowUpCheckIn',
      resourceId: checkInId,
      patientId: checkIn.patientId,
      metadata: { dayOffset: checkIn.dayOffset },
    });

    return { messageId, text: body };
  }

  private async handleConsentFlow(
    patient: Patient,
    conversationId: string,
    text: string,
    inboundMessageId: string,
  ): Promise<OutboundResult | null> {
    const normalized = normalizeText(text);
    const consent = await this.getConsent(patient.id);

    if (CONSENT_WITHDRAW_WORDS.some((w) => normalized.includes(w))) {
      if (consent) {
        await this.prisma.consent.update({
          where: { id: consent.id },
          data: { status: ConsentStatus.WITHDRAWN, withdrawnAt: new Date(), evidenceMessageId: inboundMessageId },
        });
      }
      await this.prisma.followUpPlan.updateMany({
        where: { patientId: patient.id, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.ACTIVE] } },
        data: { status: FollowUpStatus.CANCELLED },
      });
      await this.alerts.createOperational({
        patient,
        level: 'YELLOW',
        title: 'Consentimiento retirado',
        summary: 'El paciente retiro la autorizacion de seguimiento por WhatsApp. Se suspendieron los contactos automaticos.',
        ruleId: 'OPS-CONSENT-WITHDRAWN',
      });
      await this.audit.record({
        hospitalId: patient.hospitalId,
        actorType: 'PATIENT',
        action: 'CONSENT_WITHDRAWN',
        resource: 'Consent',
        resourceId: consent?.id,
        patientId: patient.id,
      });

      const body = 'Tu autorizacion fue retirada. No volveremos a escribirte para el seguimiento. Si necesitas atencion, comunicate con tu hospital. Gracias.';
      const messageId = await this.dispatch(patient, body, conversationId, {
        author: MessageAuthor.SYSTEM,
        deterministic: true,
        metadata: { kind: 'CONSENT_WITHDRAWN' },
      });
      return { messageId, text: body };
    }

    if (consent?.status === ConsentStatus.GRANTED) return null;

    if (CONSENT_ACCEPT_WORDS.some((w) => normalized.includes(w))) {
      await this.prisma.consent.upsert({
        where: { id: consent?.id ?? '00000000-0000-0000-0000-000000000000' },
        update: { status: ConsentStatus.GRANTED, grantedAt: new Date(), evidenceMessageId: inboundMessageId },
        create: {
          patientId: patient.id,
          status: ConsentStatus.GRANTED,
          textVersion: CONSENT_TEXT_VERSION,
          textSnapshot: CONSENT_TEXT,
          grantedAt: new Date(),
          evidenceMessageId: inboundMessageId,
        },
      });
      await this.audit.record({
        hospitalId: patient.hospitalId,
        actorType: 'PATIENT',
        action: 'CONSENT_GRANTED',
        resource: 'Consent',
        patientId: patient.id,
        metadata: { textVersion: CONSENT_TEXT_VERSION, evidenceMessageId: inboundMessageId },
      });

      const body = 'Gracias por autorizar el seguimiento. Cuentame, como te has sentido hoy?';
      const messageId = await this.dispatch(patient, body, conversationId, {
        author: MessageAuthor.AI,
        deterministic: true,
        metadata: { kind: 'CONSENT_GRANTED' },
      });
      return { messageId, text: body };
    }

    const messageId = await this.dispatch(patient, CONSENT_TEXT, conversationId, {
      author: MessageAuthor.SYSTEM,
      deterministic: true,
      metadata: { kind: 'CONSENT_REQUEST' },
    });
    return { messageId, text: CONSENT_TEXT };
  }

  /** Notifica a la central de enfermeria cuando el escalamiento lo exige. */
  private async notifyStaffEscalation(patient: Patient, evaluation: RiskEvaluation, alertId?: string): Promise<void> {
    if (evaluation.escalation !== 'IMMEDIATE_CALL' && evaluation.escalation !== 'EMERGENCY_REFERRAL') return;
    const hospital = await this.prisma.hospital.findUnique({ where: { id: patient.hospitalId } });
    if (!hospital?.escalationPhone) return;

    const body = [
      `ALERTA ${evaluation.level} - MedFollow AI`,
      `Paciente: ${patient.fullName}`,
      `Motivo: ${evaluation.triggered.map((t) => t.title).join(', ')}`,
      `Accion: ${evaluation.recommendedAction}`,
      alertId ? `Alerta: ${alertId}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.whatsapp.send({ to: hospital.escalationPhone, body });
      this.logger.warn(`Escalamiento notificado a la central del hospital ${hospital.id}`);
    } catch (error) {
      this.logger.error('No se pudo notificar el escalamiento a la central', error as Error);
    }
  }

  /**
   * Procesa un mensaje entrante del paciente de principio a fin.
   * Es idempotente frente a reentregas del proveedor (providerMessageId).
   */
  async handleInbound(params: {
    patient: Patient;
    text: string;
    channel: Channel;
    providerMessageId?: string;
  }): Promise<InboundResult> {
    const { patient, text, channel } = params;

    if (params.providerMessageId) {
      const duplicate = await this.prisma.message.findFirst({
        where: { providerMessageId: params.providerMessageId, direction: MessageDirection.INBOUND },
      });
      if (duplicate) {
        this.logger.log(`Mensaje ${params.providerMessageId} ya procesado: se ignora la reentrega`);
        return {
          conversationId: duplicate.conversationId,
          inboundMessageId: duplicate.id,
          intent: 'DUPLICATE',
          consentRequired: false,
        };
      }
    }

    const conversation = await this.conversations.getOrCreateOpen(patient.id, patient.hospitalId, channel);
    const inbound = await this.conversations.appendMessage({
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      author: MessageAuthor.PATIENT,
      body: text,
      providerMessageId: params.providerMessageId ?? null,
    });
    await this.patients.touchLastContact(patient.id);

    await this.audit.record({
      hospitalId: patient.hospitalId,
      actorType: 'PATIENT',
      action: 'MESSAGE_RECEIVED',
      resource: 'Message',
      resourceId: inbound.id,
      patientId: patient.id,
      metadata: { channel },
    });

    // 1. Consentimiento: ninguna evaluacion clinica ocurre sin autorizacion vigente.
    const consentOutcome = await this.handleConsentFlow(patient, conversation.id, text, inbound.id);
    if (consentOutcome) {
      return {
        conversationId: conversation.id,
        inboundMessageId: inbound.id,
        replyMessageId: consentOutcome.messageId,
        reply: consentOutcome.text,
        intent: 'CONSENT',
        consentRequired: true,
      };
    }

    const plan = await this.prisma.followUpPlan.findFirst({
      where: { patientId: patient.id, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.ACTIVE] } },
      orderBy: { createdAt: 'desc' },
      include: { medications: true },
    });
    const protocol = plan
      ? (this.protocols.getByCode(plan.protocolCode) ?? this.protocols.resolveForDiagnosis(plan.diagnosisText))
      : this.protocols.resolveForDiagnosis('');

    // 2. Capa 1: comprension del mensaje y extraccion de senales clinicas.
    const history = await this.conversations.recentMessages(conversation.id, 8);
    const extraction = await this.ai.extractSignals({
      text,
      patient: this.patientBrief(patient),
      protocol: this.protocolBrief(protocol),
      recentMessages: history
        .filter((m) => m.id !== inbound.id)
        .map((m) => ({ author: m.author, text: m.body })),
      totalDoses: plan ? this.expectedDailyDoses(plan.medications) : 3,
    });

    await this.risk.persistSignals(
      patient.id,
      {
        symptoms: extraction.symptoms,
        vitals: extraction.vitals,
        adherence: extraction.adherence,
        source: extraction.deterministic ? SignalSource.HEURISTIC : SignalSource.AI_EXTRACTION,
      },
      { messageId: inbound.id, planId: plan?.id },
    );

    // 3. El contacto programado se marca como respondido.
    const openCheckIn = plan
      ? await this.prisma.followUpCheckIn.findFirst({
          where: { planId: plan.id, status: CheckInStatus.SENT },
          orderBy: { sentAt: 'desc' },
        })
      : null;
    if (openCheckIn) {
      await this.prisma.followUpCheckIn.update({
        where: { id: openCheckIn.id },
        data: { status: CheckInStatus.ANSWERED, answeredAt: new Date(), conversationId: conversation.id },
      });
    }

    // 4. Capa 2: clasificacion determinista del riesgo y escalamiento.
    const { evaluation, riskScoreId, patient: updatedPatient } = await this.risk.evaluate(patient.id, {
      checkInId: openCheckIn?.id,
    });
    const alert = await this.alerts.createFromEvaluation({
      patient: updatedPatient,
      evaluation,
      riskScoreId,
      planId: plan?.id,
    });

    if (extraction.intent === 'HUMAN_REQUEST') {
      await this.alerts.createOperational({
        patient: updatedPatient,
        level: 'YELLOW',
        title: 'El paciente solicita hablar con una persona',
        summary: `Mensaje del paciente: "${text.slice(0, 280)}"`,
        planId: plan?.id,
        ruleId: 'OPS-HUMAN-REQUEST',
      });
    }

    // 5. Respuesta al paciente: en rojo se usa el texto del motor de reglas.
    const mandatoryGuidance = patientSafetyMessage(evaluation);
    const nextQuestion = extraction.intent === 'QUESTION' ? undefined : evaluation.nextQuestions[0]?.text;
    const reply = await this.ai.composeReply({
      patient: this.patientBrief(updatedPatient),
      protocol: this.protocolBrief(protocol),
      riskLevel: evaluation.level,
      mandatoryGuidance,
      nextQuestion,
      patientMessage: text,
      recentMessages: history.map((m) => ({ author: m.author, text: m.body })),
    });

    const replyMessageId = await this.dispatch(updatedPatient, reply.text, conversation.id, {
      author: MessageAuthor.AI,
      aiModel: reply.model,
      aiLatencyMs: reply.latencyMs,
      deterministic: reply.deterministic,
      metadata: {
        kind: 'FOLLOWUP_REPLY',
        riskLevel: evaluation.level,
        riskScore: evaluation.score,
        triggeredRuleIds: evaluation.triggered.map((t) => t.ruleId),
        extractionModel: extraction.model,
        extractionSummary: extraction.summary,
        alertId: alert?.id ?? null,
      },
    });

    await this.notifyStaffEscalation(updatedPatient, evaluation, alert?.id);

    return {
      conversationId: conversation.id,
      inboundMessageId: inbound.id,
      replyMessageId,
      reply: reply.text,
      evaluation,
      alertId: alert?.id,
      intent: extraction.intent,
      consentRequired: false,
    };
  }

  /** Marca como no contactado un seguimiento sin respuesta y abre alerta operativa. */
  async markCheckInMissed(checkInId: string): Promise<void> {
    const checkIn = await this.prisma.followUpCheckIn.findUnique({
      where: { id: checkInId },
      include: { patient: true, plan: true },
    });
    if (!checkIn) return;

    await this.prisma.followUpCheckIn.update({
      where: { id: checkInId },
      data: { status: CheckInStatus.MISSED },
    });
    await this.alerts.createOperational({
      patient: checkIn.patient,
      level: 'YELLOW',
      title: 'Paciente no contactable',
      summary: `El paciente no respondio el seguimiento del dia ${checkIn.dayOffset} (${checkIn.plan.diagnosisText}). Requiere contacto telefonico.`,
      planId: checkIn.planId,
      ruleId: 'OPS-NO-RESPONSE',
    });
    await this.audit.record({
      hospitalId: checkIn.plan.hospitalId,
      actorType: 'SYSTEM',
      action: 'CHECKIN_MISSED',
      resource: 'FollowUpCheckIn',
      resourceId: checkInId,
      patientId: checkIn.patientId,
      metadata: { dayOffset: checkIn.dayOffset },
    });
  }

  /** Cierra los planes cuyo ultimo contacto ya paso. */
  async completeFinishedPlans(): Promise<number> {
    const result = await this.prisma.followUpPlan.updateMany({
      where: {
        status: FollowUpStatus.ACTIVE,
        endDate: { lt: new Date() },
        checkIns: { every: { status: { in: [CheckInStatus.ANSWERED, CheckInStatus.MISSED, CheckInStatus.SKIPPED] } } },
      },
      data: { status: FollowUpStatus.COMPLETED },
    });
    return result.count;
  }

  activePlanFor(patientId: string): Promise<FollowUpPlan | null> {
    return this.risk.getActivePlan(patientId);
  }
}
