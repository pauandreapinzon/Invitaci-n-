import { Injectable, Logger } from '@nestjs/common';
import { OutboundMessage, SendResult, WhatsAppChannelProvider } from '../whatsapp.types';

export interface MetaOptions {
  token: string;
  phoneNumberId: string;
}

/** Canal WhatsApp via Meta Cloud API (WhatsApp Business Platform). */
@Injectable()
export class MetaWhatsAppProvider implements WhatsAppChannelProvider {
  readonly name = 'meta';
  readonly available: boolean;
  private readonly logger = new Logger('WhatsApp:meta');

  constructor(private readonly options: MetaOptions) {
    this.available = Boolean(options.token && options.phoneNumberId);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.available) throw new Error('Meta WhatsApp no esta configurado');
    const url = `https://graph.facebook.com/v21.0/${this.options.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to.replace('+', ''),
        type: 'text',
        text: { preview_url: false, body: message.body },
      }),
    });

    const payload = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!response.ok) {
      this.logger.error(`Meta respondio ${response.status}: ${payload.error?.message ?? 'error'}`);
      throw new Error(`Meta respondio ${response.status}`);
    }
    return { providerMessageId: payload.messages?.[0]?.id ?? 'sin-id', provider: this.name };
  }
}
