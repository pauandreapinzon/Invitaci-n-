import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MetricsService } from './metrics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('metricas')
@ApiBearerAuth()
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics/overview')
  @ApiOperation({ summary: 'Indicadores principales del programa de seguimiento' })
  overview(@CurrentUser() user: RequestUser) {
    return this.metrics.overview(user.hospitalId);
  }

  @Get('metrics/alerts-timeseries')
  @ApiOperation({ summary: 'Alertas por dia y nivel' })
  timeseries(@CurrentUser() user: RequestUser, @Query('days') days?: string) {
    return this.metrics.alertsTimeSeries(user.hospitalId, days ? Number(days) : 14);
  }

  @Get('metrics/top-rules')
  @ApiOperation({ summary: 'Reglas clinicas que mas se disparan' })
  topRules(@CurrentUser() user: RequestUser, @Query('days') days?: string) {
    return this.metrics.topTriggeredRules(user.hospitalId, days ? Number(days) : 30);
  }

  @Get('reports/followup')
  @Roles(Role.ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Reporte del periodo para auditoria institucional' })
  report(@CurrentUser() user: RequestUser, @Query('from') from?: string, @Query('to') to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.metrics.report(user.hospitalId, fromDate, toDate);
  }
}
