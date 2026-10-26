import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PatientsModule } from '../patients/patients.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [WhatsAppModule, PatientsModule, OrchestratorModule],
  controllers: [ChannelController],
})
export class ChannelModule {}
