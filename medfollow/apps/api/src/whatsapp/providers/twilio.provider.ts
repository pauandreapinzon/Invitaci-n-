import { Injectable, Logger } from '@nestjs/common';
import { OutboundMessage, SendResult, WhatsAppChannelProvider } from '../whatsapp.types';

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  from: string;
}

/** Canal WhatsApp via Twilio Programmable Messaging. */
@Injectable()
export class TwilioWhatsAppProvider implements WhatsAppChannelProvider {
  readonly name = 'twilio';
  readonly available: boolean;
  private readonly logger = new Logger('WhatsApp:twilio');

  constructor(private readonly options: TwilioOptions) {
    this.available = Boolean(options.accountSid && options.authToken && options.from);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.available) throw new Error('Twilio no esta configurado');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.options.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: message.to.startsWith('whatsapp:') ? message.to : `whatsapp:${message.to}`,
      From: this.options.from,
      Body: message.body,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.accountSid}:${this.options.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const payload = (await response.json()) as { sid?: string; message?: string };
    if (!response.ok) {
      this.logger.error(`Twilio respondio ${response.status}: ${payload.message ?? 'error'}`);
      throw new Error(`Twilio respondio ${response.status}`);
    }
    return { providerMessageId: payload.sid ?? 'sin-sid', provider: this.name };
  }
}
