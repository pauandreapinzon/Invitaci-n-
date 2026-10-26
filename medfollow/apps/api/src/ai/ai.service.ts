import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SymptomObservation, Vitals } from '@medfollow/clinical-engine';
import {
  AiProvider,
  ComposeReplyRequest,
  ExplainDiagnosisRequest,
  ExtractionRequest,
  ExtractionResult,
  GeneratedText,
} from './ai.types';
import { DeterministicAiProvider } from './providers/deterministic.provider';
import { ClaudeAiProvider } from './providers/claude.provider';
import { AzureOpenAiProvider } from './providers/azure-openai.provider';
import { containsProhibitedContent } from './prompts';

/**
 * Fachada de la capa de IA.
 *
 * Garantias que ofrece al resto del sistema:
 *  1. Siempre responde: si el LLM falla se usa el proveedor determinista.
 *  2. La extraccion heuristica se fusiona con la del LLM, de modo que una
 *     bandera roja detectable por reglas nunca se pierde por un error del modelo.
 *  3. Ningun texto con contenido prohibido (dosis, diagnostico) llega al paciente.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly primary: AiProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly deterministic: DeterministicAiProvider,
  ) {
    this.primary = this.resolvePrimaryProvider();
    this.logger.log(`Proveedor de IA activo: ${this.primary.name}`);
  }

  private resolvePrimaryProvider(): AiProvider {
    const provider = this.config.get<string>('ai.provider') ?? 'deterministic';

    if (provider === 'claude') {
      const claude = new ClaudeAiProvider({
        apiKey: this.config.get<string>('ai.anthropic.apiKey') ?? '',
        model: this.config.get<string>('ai.anthropic.model') ?? 'claude-opus-5-5',
      });
      if (claude.available) return claude;
      this.logger.warn('AI_PROVIDER=claude pero falta ANTHROPIC_API_KEY: se usa el motor determinista');
    }

    if (provider === 'azure-openai') {
      const azure = new AzureOpenAiProvider({
        endpoint: this.config.get<string>('ai.azure.endpoint') ?? '',
        apiKey: this.config.get<string>('ai.azure.apiKey') ?? '',
        deployment: this.config.get<string>('ai.azure.deployment') ?? '',
        apiVersion: this.config.get<string>('ai.azure.apiVersion') ?? '2024-10-21',
      });
      if (azure.available) return azure;
      this.logger.warn('AI_PROVIDER=azure-openai incompleto: se usa el motor determinista');
    }

    return this.deterministic;
  }

  get providerName(): string {
    return this.primary.name;
  }

  /**
   * Union de senales: lo detectado por reglas se conserva siempre y el LLM
   * solo puede agregar o enriquecer. Un sintoma afirmado por cualquiera de los
   * dos se considera presente (criterio conservador en favor de la seguridad).
   */
  private mergeSignals(heuristic: ExtractionResult, model: ExtractionResult): ExtractionResult {
    const byCode = new Map<string, SymptomObservation>();
    for (const symptom of model.symptoms) byCode.set(symptom.code, symptom);
    for (const symptom of heuristic.symptoms) {
      const existing = byCode.get(symptom.code);
      if (!existing) {
        byCode.set(symptom.code, symptom);
        continue;
      }
      byCode.set(symptom.code, {
        code: symptom.code,
        present: existing.present || symptom.present,
        severity: existing.severity ?? symptom.severity,
        trend: existing.trend ?? symptom.trend,
        onsetDays: existing.onsetDays ?? symptom.onsetDays,
        quote: existing.quote ?? symptom.quote,
      });
    }

    const vitals: Vitals = { ...model.vitals };
    for (const [metric, value] of Object.entries(heuristic.vitals)) {
      if (vitals[metric as keyof Vitals] === undefined && value !== undefined) {
        vitals[metric as keyof Vitals] = value as number;
      }
    }

    return {
      symptoms: Array.from(byCode.values()),
      vitals,
      adherence: model.adherence ?? heuristic.adherence,
      intent: model.intent === 'OTHER' || model.intent === 'SMALL_TALK' ? heuristic.intent : model.intent,
      summary: model.summary || heuristic.summary,
      model: `${model.model}+${heuristic.model}`,
      latencyMs: model.latencyMs,
      deterministic: model.deterministic && heuristic.deterministic,
    };
  }

  async extractSignals(request: ExtractionRequest): Promise<ExtractionResult> {
    const heuristic = await this.deterministic.extractSignals(request);
    if (this.primary === this.deterministic) return heuristic;

    try {
      const modelResult = await this.primary.extractSignals(request);
      return this.mergeSignals(heuristic, modelResult);
    } catch (error) {
      this.logger.error(`Extraccion con ${this.primary.name} fallo: se usa la heuristica`, error as Error);
      return heuristic;
    }
  }

  async explainDiagnosis(request: ExplainDiagnosisRequest): Promise<GeneratedText> {
    if (this.primary === this.deterministic) return this.deterministic.explainDiagnosis(request);
    try {
      const generated = await this.primary.explainDiagnosis(request);
      if (containsProhibitedContent(generated.text)) {
        this.logger.warn('Explicacion descartada por contenido prohibido: se usa la plantilla');
        return this.deterministic.explainDiagnosis(request);
      }
      return generated;
    } catch (error) {
      this.logger.error(`Explicacion con ${this.primary.name} fallo`, error as Error);
      return this.deterministic.explainDiagnosis(request);
    }
  }

  /**
   * En riesgo ROJO no se usa el LLM: el mensaje de urgencia sale textual del
   * motor de reglas para que no pueda ser suavizado ni reinterpretado.
   */
  async composeReply(request: ComposeReplyRequest): Promise<GeneratedText> {
    if (request.riskLevel === 'RED' || this.primary === this.deterministic) {
      return this.deterministic.composeReply(request);
    }
    try {
      const generated = await this.primary.composeReply(request);
      if (containsProhibitedContent(generated.text)) {
        this.logger.warn('Respuesta descartada por contenido prohibido: se usa la plantilla');
        return this.deterministic.composeReply(request);
      }
      if (request.mandatoryGuidance && !generated.text.includes(request.mandatoryGuidance.slice(0, 24))) {
        // La indicacion obligatoria se adjunta si el modelo la omitio.
        return { ...generated, text: `${generated.text}\n\n${request.mandatoryGuidance}` };
      }
      return generated;
    } catch (error) {
      this.logger.error(`Redaccion con ${this.primary.name} fallo`, error as Error);
      return this.deterministic.composeReply(request);
    }
  }
}
