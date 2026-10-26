import { Injectable, Logger } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  hospitalId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  actorRole?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  patientId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Bitacora de auditoria (Resolucion 1995 de 1999 y Ley 1581 de 2012).
 * Registra todo acceso o modificacion de datos clinicos identificables.
 * Nunca almacena el contenido clinico en si, solo la huella del acceso.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          hospitalId: entry.hospitalId ?? null,
          actorId: entry.actorId ?? null,
          actorType: entry.actorType ?? ActorType.USER,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId ?? null,
          patientId: entry.patientId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          metadata: entry.metadata ?? {},
        },
      });
    } catch (error) {
      // La auditoria nunca debe tumbar una operacion clinica, pero si debe alertar.
      this.logger.error(`No se pudo registrar auditoria para ${entry.action}`, error as Error);
    }
  }

  async list(params: {
    hospitalId: string;
    patientId?: string;
    action?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      hospitalId: params.hospitalId,
      ...(params.patientId ? { patientId: params.patientId } : {}),
      ...(params.action ? { action: params.action } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.take ?? 50,
        skip: params.skip ?? 0,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
