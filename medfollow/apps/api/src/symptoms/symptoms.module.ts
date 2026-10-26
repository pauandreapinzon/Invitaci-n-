import { Module } from '@nestjs/common';
import { SymptomsService } from './symptoms.service';
import { SymptomsController } from './symptoms.controller';
import { RiskModule } from '../risk/risk.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [RiskModule, AlertsModule],
  controllers: [SymptomsController],
  providers: [SymptomsService],
})
export class SymptomsModule {}
