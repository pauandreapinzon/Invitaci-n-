import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CheckInStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConversationOrchestrator } from '../orchestrator/conversation-orchestrator.service';

/** Horas sin respuesta tras las que se considera un contacto fallido. */
const MISSED_AFTER_HOURS = 24;
/** Maximo de contactos despachados por ciclo (protege el rate limit del canal). */
const BATCH_SIZE = 50;

/**
 * Despachador de seguimientos programados.
 * Es idempotente: solo toma contactos en estado PENDING cuya hora ya llego,
 * de modo que un reinicio del proceso no duplica mensajes.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ConversationOrchestrator,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueCheckIns(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.followUpCheckIn.findMany({
        where: {
          status: CheckInStatus.PENDING,
          scheduledAt: { lte: new Date() },
          plan: { status: { in: ['SCHEDULED', 'ACTIVE'] } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const checkIn of due) {
        try {
          const result = await this.orchestrator.sendCheckIn(checkIn.id);
          if (result.skipped) {
            this.logger.log(`Seguimiento ${checkIn.id} aplazado: ${result.skipped}`);
          }
        } catch (error) {
          this.logger.error(`Fallo el envio del seguimiento ${checkIn.id}`, error as Error);
        }
      }
      if (due.length) this.logger.log(`Seguimientos procesados en este ciclo: ${due.length}`);
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async markMissedCheckIns(): Promise<void> {
    const threshold = new Date(Date.now() - MISSED_AFTER_HOURS * 60 * 60 * 1000);
    const stale = await this.prisma.followUpCheckIn.findMany({
      where: { status: CheckInStatus.SENT, sentAt: { lte: threshold } },
      take: BATCH_SIZE,
    });
    for (const checkIn of stale) {
      await this.orchestrator.markCheckInMissed(checkIn.id);
    }
    if (stale.length) this.logger.warn(`Seguimientos sin respuesta marcados: ${stale.length}`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async closeFinishedPlans(): Promise<void> {
    const closed = await this.orchestrator.completeFinishedPlans();
    if (closed) this.logger.log(`Planes de seguimiento completados: ${closed}`);
  }
}
