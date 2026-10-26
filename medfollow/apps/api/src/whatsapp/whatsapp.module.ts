import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { ConsoleWhatsAppProvider } from './providers/console.provider';

@Module({
  providers: [WhatsAppService, ConsoleWhatsAppProvider],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
