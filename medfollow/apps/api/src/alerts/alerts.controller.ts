import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AlertsService } from './alerts.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { ResolveAlertDto } from './dto/resolve-alert.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('alertas')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Cola de alertas clinicas priorizada' })
  findAll(@Query() query: QueryAlertsDto, @CurrentUser() user: RequestUser) {
    return this.alerts.findAll(query, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Conteo de alertas por nivel y estado' })
  summary(@CurrentUser() user: RequestUser) {
    return this.alerts.queueSummary(user.hospitalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de la alerta con su evidencia clinica' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.findOne(id, user);
  }

  @Patch(':id/acknowledge')
  @Roles(Role.NURSE, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Tomar la alerta (registra el tiempo de respuesta)' })
  acknowledge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.acknowledge(id, user);
  }

  @Patch(':id/assign/:assigneeId')
  @Roles(Role.NURSE, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Asignar la alerta a un miembro del equipo' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assigneeId', ParseUUIDPipe) assigneeId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.alerts.assign(id, assigneeId, user);
  }

  @Patch(':id/resolve')
  @Roles(Role.NURSE, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Cerrar la alerta con nota de resolucion' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveAlertDto, @CurrentUser() user: RequestUser) {
    return this.alerts.resolve(id, dto.resolutionNote, user);
  }
}
