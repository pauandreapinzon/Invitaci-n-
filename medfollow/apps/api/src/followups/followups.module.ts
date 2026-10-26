import { Module } from '@nestjs/common';
import { FollowUpsService } from './followups.service';
import { FollowUpsController } from './followups.controller';
import { ProtocolsModule } from '../protocols/protocols.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [ProtocolsModule, OrchestratorModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
