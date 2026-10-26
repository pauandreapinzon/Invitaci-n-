import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConsoleWhatsAppProvider } from './providers/console.provider';
import { MetaWhatsAppProvider } from './providers/meta.provider';
import { TwilioWhatsAppProvider } from './providers/twilio.provider';
import { InboundMessage, OutboundMessage, SendResult, WhatsAppChannelProvider } from './whatsapp.types';

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ from: string; id: string; timestamp?: string; type?: string; text?: { body?: string } }>;
      };
    }>;
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: WhatsAppChannelProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly consoleProvider: ConsoleWhatsAppProvider,
  ) {
    this.provider = this.resolveProvider();
    this.logger.log(`Canal WhatsApp activo: ${this.provider.name}`);
  }

  private resolveProvider(): WhatsAppChannelProvider {
    const configured = this.config.get<string>('whatsapp.provider') ?? 'console';

    if (configured === 'twilio') {
      const twilio = new TwilioWhatsAppProvider({
        accountSid: this.config.get<string>('whatsapp.twilio.accountSid') ?? '',
        authToken: this.config.get<string>('whatsapp.twilio.authToken') ?? '',
        from: this.config.get<string>('whatsapp.twilio.from') ?? '',
      });
      if (twilio.available) return twilio;
      this.logger.warn('WHATSAPP_PROVIDER=twilio incompleto: se usa el canal de consola');
    }

    if (configured === 'meta') {
      const meta = new MetaWhatsAppProvider({
        token: this.config.get<string>('whatsapp.meta.token') ?? '',
        phoneNumberId: this.config.get<string>('whatsapp.meta.phoneNumberId') ?? '',
      });
      if (meta.available) return meta;
      this.logger.warn('WHATSAPP_PROVIDER=meta incompleto: se usa el canal de consola');
    }

    return this.consoleProvider;
  }

  get providerName(): string {
    return this.provider.name;
  }

  send(message: OutboundMessage): Promise<SendResult> {
    return this.provider.send(message);
  }

  /** Verificacion del webhook de Meta (handshake hub.challenge). */
  verifyMetaChallenge(mode?: string, token?: string): boolean {
    const expected = this.config.get<string>('whatsapp.meta.verifyToken');
    return mode === 'subscribe' && Boolean(token) && token === expected;
  }

  /**
   * Valida la firma X-Hub-Signature-256 de Meta sobre el cuerpo crudo.
   * Si no hay secreto configurado (desarrollo) se registra y se acepta.
   */
  verifyMetaSignature(rawBody: Buffer | undefined, signature?: string): boolean {
    const secret = this.config.get<string>('whatsapp.meta.appSecret');
    if (!secret) {
      this.logger.warn('META_APP_SECRET no configurado: la firma del webhook no se valida');
      return true;
    }
    if (!rawBody || !signature) return false;
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Valida la firma X-Twilio-Signature (HMAC-SHA1 de url + parametros ordenados). */
  verifyTwilioSignature(url: string, params: Record<string, string>, signature?: string): boolean {
    const token = this.config.get<string>('whatsapp.twilio.authToken');
    if (!token) {
      this.logger.warn('TWILIO_AUTH_TOKEN no configurado: la firma del webhook no se valida');
      return true;
    }
    if (!signature) return false;
    const payload = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);
    const expected = createHmac('sha1', token).update(payload).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseMetaPayload(payload: MetaWebhookPayload): InboundMessage[] {
    const messages: InboundMessage[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          if (message.type && message.type !== 'text') continue;
          messages.push({
            from: message.from.startsWith('+') ? message.from : `+${message.from}`,
            text: message.text?.body ?? '',
            providerMessageId: message.id,
            provider: 'meta',
            receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
          });
        }
      }
    }
    return messages.filter((m) => m.text.trim().length > 0);
  }

  parseTwilioPayload(body: Record<string, string>): InboundMessage | undefined {
    const from = (body.From ?? '').replace('whatsapp:', '');
    const text = body.Body ?? '';
    if (!from || !text.trim()) return undefined;
    return {
      from,
      text,
      providerMessageId: body.MessageSid ?? body.SmsMessageSid ?? `twilio-${Date.now()}`,
      provider: 'twilio',
      receivedAt: new Date(),
    };
  }
}
