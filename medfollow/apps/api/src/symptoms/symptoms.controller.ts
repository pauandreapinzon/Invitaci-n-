import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SymptomsService } from './symptoms.service';
import { CreateSymptomDto } from './dto/create-symptom.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('sintomas')
@ApiBearerAuth()
@Controller('symptoms')
export class SymptomsController {
  constructor(private readonly symptoms: SymptomsService) {}

  @Post()
  @Roles(Role.NURSE, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Registrar sintomas, signos vitales o adherencia y reevaluar el riesgo' })
  create(@Body() dto: CreateSymptomDto, @CurrentUser() user: RequestUser) {
    return this.symptoms.create(dto, user);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Catalogo clinico de sintomas reconocidos' })
  catalog() {
    return this.symptoms.catalog();
  }

  @Get()
  @ApiOperation({ summary: 'Sintomas y signos registrados de un paciente' })
  findForPatient(@Query('patientId') patientId: string, @CurrentUser() user: RequestUser) {
    return this.symptoms.findForPatient(patientId, user);
  }
}
