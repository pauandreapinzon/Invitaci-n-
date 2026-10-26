import { Module } from '@nestjs/common';
import { ConversationOrchestrator } from './conversation-orchestrator.service';
import { AiModule } from '../ai/ai.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PatientsModule } from '../patients/patients.module';
import { ProtocolsModule } from '../protocols/protocols.module';
import { RiskModule } from '../risk/risk.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AiModule, WhatsAppModule, ConversationsModule, PatientsModule, ProtocolsModule, RiskModule, AlertsModule],
  providers: [ConversationOrchestrator],
  exports: [ConversationOrchestrator],
})
export class OrchestratorModule {}
