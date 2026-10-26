import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DOCTOR, Role.NURSE)
  @ApiOperation({ summary: 'Registrar paciente para seguimiento' })
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: RequestUser) {
    return this.patients.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pacientes monitoreados' })
  findAll(@Query() query: QueryPatientsDto, @CurrentUser() user: RequestUser) {
    return this.patients.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle clinico del paciente' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query('revealContact') revealContact?: string,
  ) {
    return this.patients.findOne(id, user, { revealContact: revealContact === 'true' });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DOCTOR, Role.NURSE)
  @ApiOperation({ summary: 'Actualizar datos del paciente' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto, @CurrentUser() user: RequestUser) {
    return this.patients.update(id, dto, user);
  }
}
