import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OutboundMessage, SendResult, WhatsAppChannelProvider } from '../whatsapp.types';

/**
 * Canal de desarrollo: registra el mensaje en el log en lugar de enviarlo.
 * Permite operar y demostrar el flujo completo sin credenciales de WhatsApp
 * (el simulador web del dashboard usa este canal).
 */
@Injectable()
export class ConsoleWhatsAppProvider implements WhatsAppChannelProvider {
  readonly name = 'console';
  readonly available = true;
  private readonly logger = new Logger('WhatsApp:console');

  async send(message: OutboundMessage): Promise<SendResult> {
    this.logger.log(`-> ${message.to}: ${message.body.replace(/\n/g, ' | ')}`);
    return { providerMessageId: `console-${randomUUID()}`, provider: this.name };
  }
}
