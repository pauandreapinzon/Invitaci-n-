import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProtocolsService } from './protocols.service';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@ApiTags('protocolos')
@ApiBearerAuth()
@Controller('protocols')
export class ProtocolsController {
  constructor(private readonly protocols: ProtocolsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar protocolos de seguimiento disponibles' })
  findAll(@CurrentUser() user: RequestUser) {
    return this.protocols.findAll(user.hospitalId);
  }

  @Get('rules/global')
  @ApiOperation({ summary: 'Reglas clinicas globales del motor determinista' })
  globalRules() {
    return this.protocols.listGlobalRules();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Detalle del protocolo con sus reglas aplicables' })
  findOne(@Param('code') code: string) {
    return this.protocols.findOne(code);
  }
}
