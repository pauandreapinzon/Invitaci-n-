import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ConversationsService } from './conversations.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('conversaciones')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Conversaciones de un paciente' })
  list(@Query('patientId', ParseUUIDPipe) patientId: string, @CurrentUser() user: RequestUser) {
    return this.conversations.listForPatient(patientId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Historial completo de la conversacion (acceso auditado)' })
  transcript(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.conversations.transcript(id, user);
  }

  @Patch(':id/handover')
  @Roles(Role.NURSE, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Tomar el control humano de la conversacion' })
  handOver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.conversations.handOver(id, user);
  }
}
