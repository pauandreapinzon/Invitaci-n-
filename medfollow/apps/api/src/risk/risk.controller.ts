import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EvaluationContext } from '@medfollow/clinical-engine';
import { RiskService } from './risk.service';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('riesgo')
@ApiBearerAuth()
@Controller()
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get('risk-score')
  @ApiOperation({ summary: 'Riesgo vigente del paciente con su trazabilidad' })
  current(@Query('patientId') patientId: string, @CurrentUser() user: RequestUser) {
    return this.risk.getCurrent(patientId, user);
  }

  @Get('risk-score/history')
  @ApiOperation({ summary: 'Historico de evaluaciones de riesgo' })
  history(@Query('patientId') patientId: string, @CurrentUser() user: RequestUser) {
    return this.risk.history(patientId, user);
  }

  @Post('risk-score/simulate')
  @ApiOperation({
    summary: 'Evaluar un contexto hipotetico sin persistir (validacion clinica del motor)',
  })
  simulate(@Body() body: { context: EvaluationContext; protocolCode?: string }) {
    return this.risk.simulate(body.context, body.protocolCode);
  }
}
