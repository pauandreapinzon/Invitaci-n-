import { Injectable, Logger } from '@nestjs/common';
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

export interface AzureOpenAiOptions {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * Proveedor Azure OpenAI, alternativa para instituciones que requieren
 * residencia de datos y acuerdos empresariales dentro de su tenant de Azure.
 */
@Injectable()
export class AzureOpenAiProvider implements AiProvider {
  readonly name: string;
  readonly available: boolean;
  private readonly logger = new Logger(AzureOpenAiProvider.name);

  constructor(private readonly options: AzureOpenAiOptions) {
    this.name = `azure-openai:${options.deployment || 'sin-deployment'}`;
    this.available = Boolean(options.endpoint && options.apiKey && options.deployment);
  }

  private async chat(system: string, prompt: string, json: boolean, maxTokens: number): Promise<{ content: string; latencyMs: number }> {
    if (!this.available) throw new Error('Azure OpenAI no esta configurado');
    const startedAt = Date.now();
    const url = `${this.options.endpoint.replace(/\/$/, '')}/openai/deployments/${this.options.deployment}/chat/completions?api-version=${this.options.apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': this.options.apiKey },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: json ? 0 : 0.3,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(`Azure OpenAI respondio ${response.status}: ${payload.error?.message ?? 'error desconocido'}`);
    }
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Azure OpenAI devolvio una respuesta vacia');
    return { content, latencyMs: Date.now() - startedAt };
  }

  async extractSignals(request: ExtractionRequest): Promise<ExtractionResult> {
    const schemaHint = `Responde unicamente con JSON valido con esta forma:
{"symptoms":[{"code":"FEVER","present":true,"severity":null,"trend":null,"onsetDays":null,"quote":null}],
 "vitals":{"temperatureC":null,"heartRate":null,"respiratoryRate":null,"spo2":null,"systolicBp":null,"diastolicBp":null,"glucoseMgDl":null},
 "adherence":null,"intent":"SYMPTOM_REPORT","summary":"..."}`;

    const { content, latencyMs } = await this.chat(
      `${EXTRACTION_SYSTEM_PROMPT}\n\n${schemaHint}`,
      buildExtractionUserPrompt(request),
      true,
      1500,
    );

    const parsed = JSON.parse(content) as {
      symptoms?: Array<Record<string, unknown>>;
      vitals?: Record<string, number | null>;
      adherence?: { missedDoses: number; totalDoses: number } | null;
      intent?: string;
      summary?: string;
    };

    const symptoms: SymptomObservation[] = (parsed.symptoms ?? [])
      .filter((s) => typeof s.code === 'string' && Boolean(SYMPTOM_BY_CODE[s.code as string]))
      .map((s) => ({
        code: s.code as string,
        present: s.present !== false,
        severity: (s.severity as SymptomObservation['severity']) ?? undefined,
        trend: (s.trend as SymptomObservation['trend']) ?? undefined,
        onsetDays: typeof s.onsetDays === 'number' ? s.onsetDays : undefined,
        quote: typeof s.quote === 'string' ? s.quote : undefined,
      }));

    const vitals = Object.fromEntries(
      Object.entries(parsed.vitals ?? {}).filter(([, value]) => typeof value === 'number'),
    ) as Vitals;

    return {
      symptoms,
      vitals,
      adherence: parsed.adherence ?? undefined,
      intent: (parsed.intent as PatientIntent) ?? 'OTHER',
      summary: parsed.summary ?? '',
      model: this.name,
      latencyMs,
      deterministic: false,
    };
  }

  async explainDiagnosis(request: ExplainDiagnosisRequest): Promise<GeneratedText> {
    const { content, latencyMs } = await this.chat(EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt(request), false, 800);
    return { text: content, model: this.name, latencyMs, deterministic: false };
  }

  async composeReply(request: ComposeReplyRequest): Promise<GeneratedText> {
    const { content, latencyMs } = await this.chat(COMPOSE_SYSTEM_PROMPT, buildComposeUserPrompt(request), false, 400);
    return { text: content, model: this.name, latencyMs, deterministic: false };
  }
}
