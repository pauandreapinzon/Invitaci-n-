import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ENGINE_VERSION } from '@medfollow/clinical-engine';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './common/prisma/prisma.service';
import { AiService } from './ai/ai.service';
import { WhatsAppService } from './whatsapp/whatsapp.service';

@ApiTags('estado')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Estado del servicio y de sus dependencias' })
  async check() {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      clinicalEngine: ENGINE_VERSION,
      aiProvider: this.ai.providerName,
      whatsappProvider: this.whatsapp.providerName,
      timestamp: new Date().toISOString(),
    };
  }
}
