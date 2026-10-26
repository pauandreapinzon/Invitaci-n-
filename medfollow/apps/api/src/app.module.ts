import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { ProtocolsModule } from './protocols/protocols.module';
import { ConversationsModule } from './conversations/conversations.module';
import { RiskModule } from './risk/risk.module';
import { AlertsModule } from './alerts/alerts.module';
import { SymptomsModule } from './symptoms/symptoms.module';
import { AiModule } from './ai/ai.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { FollowUpsModule } from './followups/followups.module';
import { ChannelModule } from './channel/channel.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    ProtocolsModule,
    ConversationsModule,
    RiskModule,
    AlertsModule,
    SymptomsModule,
    AiModule,
    WhatsAppModule,
    OrchestratorModule,
    FollowUpsModule,
    ChannelModule,
    SchedulerModule,
    MetricsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
