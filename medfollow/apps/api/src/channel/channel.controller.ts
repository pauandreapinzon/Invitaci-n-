import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Logger, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Channel } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { PatientsService } from '../patients/patients.service';
import { ConversationOrchestrator } from '../orchestrator/conversation-orchestrator.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { SimulateMessageDto } from './dto/simulate-message.dto';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('canal')
@Controller()
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly patients: PatientsService,
    private readonly orchestrator: ConversationOrchestrator,
  ) {}

  @Public()
  @Get('webhooks/whatsapp')
  @ApiExcludeEndpoint()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (!this.whatsapp.verifyMetaChallenge(mode, token)) {
      throw new ForbiddenException('Token de verificacion invalido');
    }
    return challenge;
  }

  @Public()
  @Post('webhooks/whatsapp')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({ summary: 'Webhook de WhatsApp (Meta Cloud API)' })
  async metaWebhook(
    @Req() req: RawBodyRequest,
    @Body() body: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    if (!this.whatsapp.verifyMetaSignature(req.rawBody, signature)) {
      throw new ForbiddenException('Firma del webhook invalida');
    }
    const messages = this.whatsapp.parseMetaPayload(body);
    for (const message of messages) {
      await this.process(message.from, message.text, message.providerMessageId);
    }
    return { received: messages.length };
  }

  @Public()
  @Post('webhooks/whatsapp/twilio')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({ summary: 'Webhook de WhatsApp (Twilio)' })
  async twilioWebhook(
    @Req() req: Request,
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!this.whatsapp.verifyTwilioSignature(url, body, signature)) {
      throw new ForbiddenException('Firma del webhook invalida');
    }
    const message = this.whatsapp.parseTwilioPayload(body);
    if (!message) return { received: 0 };
    await this.process(message.from, message.text, message.providerMessageId);
    return { received: 1 };
  }

  private async process(from: string, text: string, providerMessageId: string): Promise<void> {
    const patient = await this.patients.findByPhone(from);
    if (!patient) {
      // No se responde a numeros desconocidos: evita exponer informacion de salud.
      this.logger.warn('Mensaje entrante de un numero sin paciente asociado: se descarta');
      return;
    }
    await this.orchestrator.handleInbound({
      patient,
      text,
      channel: Channel.WHATSAPP,
      providerMessageId,
    });
  }

  @Post('simulator/messages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Simular un mensaje entrante del paciente (demostracion y pruebas clinicas)',
    description:
      'Ejecuta exactamente el mismo flujo que WhatsApp: extraccion de senales, motor de riesgo, alertas y respuesta.',
  })
  async simulate(@Body() dto: SimulateMessageDto, @CurrentUser() user: RequestUser) {
    const patient = await this.patients.getEntity(dto.patientId, user.hospitalId);
    return this.orchestrator.handleInbound({
      patient,
      text: dto.text,
      channel: Channel.WEB_SIMULATOR,
    });
  }
}
