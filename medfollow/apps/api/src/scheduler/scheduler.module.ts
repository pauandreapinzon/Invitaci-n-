import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [ScheduleModule.forRoot(), OrchestratorModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
