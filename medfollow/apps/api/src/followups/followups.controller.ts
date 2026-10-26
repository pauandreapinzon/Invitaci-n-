import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FollowUpStatus, Role } from '@prisma/client';
import { FollowUpsService } from './followups.service';
import { CreateFollowUpDto } from './dto/create-followup.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('seguimientos')
@ApiBearerAuth()
@Controller('followups')
export class FollowUpsController {
  constructor(private readonly followups: FollowUpsService) {}

  @Post()
  @Roles(Role.DOCTOR, Role.ADMIN, Role.NURSE)
  @ApiOperation({ summary: 'Crear plan de seguimiento postconsulta' })
  create(@Body() dto: CreateFollowUpDto, @CurrentUser() user: RequestUser) {
    return this.followups.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar planes de seguimiento' })
  findAll(
    @Query() query: PaginationDto,
    @CurrentUser() user: RequestUser,
    @Query('patientId') patientId?: string,
    @Query('status') status?: FollowUpStatus,
  ) {
    return this.followups.findAll({ ...query, patientId, status }, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del plan con adherencia y alertas' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.followups.findOne(id, user);
  }

  @Patch(':id/cancel')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Cancelar el seguimiento' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.followups.cancel(id, user);
  }

  @Post('check-ins/:checkInId/send')
  @Roles(Role.NURSE, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Enviar ahora un contacto de seguimiento programado' })
  triggerCheckIn(@Param('checkInId', ParseUUIDPipe) checkInId: string, @CurrentUser() user: RequestUser) {
    return this.followups.triggerCheckIn(checkInId, user);
  }
}
