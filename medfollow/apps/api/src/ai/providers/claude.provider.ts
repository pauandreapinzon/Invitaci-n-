import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { SYMPTOM_BY_CODE, SymptomObservation, Vitals } from '@medfollow/clinical-engine';
import {
  AiProvider,
  ComposeReplyRequest,
  ExplainDiagnosisRequest,
  ExtractionRequest,
  ExtractionResult,
  GeneratedText,
  PatientIntent,
} from '../ai.types';
import {
  COMPOSE_SYSTEM_PROMPT,
  EXPLAIN_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  buildComposeUserPrompt,
  buildExplainUserPrompt,
  buildExtractionUserPrompt,
} from '../prompts';

/** Esquema de salida estructurada: el modelo no puede devolver otra forma. */
const ExtractionSchema = z.object({
  symptoms: z.array(
    z.object({
      code: z.string(),
      present: z.boolean(),
      severity: z.enum(['MILD', 'MODERATE', 'SEVERE']).nullable(),
      trend: z.enum(['IMPROVING', 'STABLE', 'WORSENING']).nullable(),
      onsetDays: z.number().int().min(0).max(90).nullable(),
      quote: z.string().nullable(),
    }),
  ),
  vitals: z.object({
    temperatureC: z.number().min(30).max(45).nullable(),
    heartRate: z.number().min(20).max(250).nullable(),
    respiratoryRate: z.number().min(4).max(80).nullable(),
    spo2: z.number().min(40).max(100).nullable(),
    systolicBp: z.number().min(40).max(280).nullable(),
    diastolicBp: z.number().min(20).max(200).nullable(),
    glucoseMgDl: z.number().min(10).max(800).nullable(),
  }),
  adherence: z
    .object({ missedDoses: z.number().int().min(0), totalDoses: z.number().int().min(0) })
    .nullable(),
  intent: z.enum(['SYMPTOM_REPORT', 'QUESTION', 'CONSENT', 'HUMAN_REQUEST', 'SMALL_TALK', 'OTHER']),
  summary: z.string().max(400),
});

export interface ClaudeProviderOptions {
  apiKey: string;
  model: string;
}

/**
 * Proveedor Claude (Anthropic Messages API) usando el SDK oficial.
 * Solo se encarga de la capa 1 (comprension del lenguaje) y de redactar
 * mensajes; la clasificacion de riesgo siempre la hace el motor determinista.
 */
@Injectable()
export class ClaudeAiProvider implements AiProvider {
  readonly name: string;
  readonly available: boolean;
  private readonly logger = new Logger(ClaudeAiProvider.name);
  private readonly client?: Anthropic;
  private readonly model: string;

  constructor(options: ClaudeProviderOptions) {
    this.model = options.model;
    this.name = `anthropic:${options.model}`;
    this.available = Boolean(options.apiKey);
    if (this.available) {
      this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 2 });
    }
  }

  private requireClient(): Anthropic {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY no configurada');
    return this.client;
  }

  async extractSignals(request: ExtractionRequest): Promise<ExtractionResult> {
    const startedAt = Date.now();
    const response = await this.requireClient().messages.parse({
      model: this.model,
      max_tokens: 2048,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildExtractionUserPrompt(request) }],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) throw new Error('El modelo no devolvio una extraccion valida');

    // Se descartan codigos fuera del catalogo: el vocabulario clinico es cerrado.
    const symptoms: SymptomObservation[] = parsed.symptoms
      .filter((s) => Boolean(SYMPTOM_BY_CODE[s.code]))
      .map((s) => ({
        code: s.code,
        present: s.present,
        severity: s.severity ?? undefined,
        trend: s.trend ?? undefined,
        onsetDays: s.onsetDays ?? undefined,
        quote: s.quote ?? undefined,
      }));

    const vitals: Vitals = Object.fromEntries(
      Object.entries(parsed.vitals).filter(([, value]) => value !== null && value !== undefined),
    ) as Vitals;

    return {
      symptoms,
      vitals,
      adherence: parsed.adherence ?? undefined,
      intent: parsed.intent as PatientIntent,
      summary: parsed.summary,
      model: this.name,
      latencyMs: Date.now() - startedAt,
      deterministic: false,
    };
  }

  private async generate(system: string, prompt: string, maxTokens: number): Promise<GeneratedText> {
    const startedAt = Date.now();
    const response = await this.requireClient().messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'low' },
    });

    if (response.stop_reason === 'refusal') {
      this.logger.warn(`El modelo declino la solicitud: ${response.stop_details?.explanation ?? 'sin detalle'}`);
      throw new Error('El modelo declino generar la respuesta');
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) throw new Error('El modelo devolvio una respuesta vacia');
    return { text, model: this.name, latencyMs: Date.now() - startedAt, deterministic: false };
  }

  explainDiagnosis(request: ExplainDiagnosisRequest): Promise<GeneratedText> {
    return this.generate(EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt(request), 1024);
  }

  composeReply(request: ComposeReplyRequest): Promise<GeneratedText> {
    return this.generate(COMPOSE_SYSTEM_PROMPT, buildComposeUserPrompt(request), 512);
  }
}
