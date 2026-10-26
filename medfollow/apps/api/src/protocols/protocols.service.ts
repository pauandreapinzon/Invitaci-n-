import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ClinicalRule,
  GLOBAL_RULES,
  Protocol,
  PROTOCOLS,
  getProtocolByCode,
  resolveProtocol,
} from '@medfollow/clinical-engine';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Catalogo de protocolos clinicos.
 *
 * Los protocolos base viven en el paquete @medfollow/clinical-engine (codigo
 * revisable y versionado) y se sincronizan en base de datos al arrancar para
 * que el hospital pueda consultarlos, aprobarlos y auditar su version.
 */
@Injectable()
export class ProtocolsService implements OnModuleInit {
  private readonly logger = new Logger(ProtocolsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.syncBaseProtocols();
  }

  async syncBaseProtocols(): Promise<void> {
    for (const protocol of PROTOCOLS) {
      // hospitalId nulo identifica los protocolos base de la plataforma; por eso
      // la busqueda se hace con findFirst y no con la clave compuesta.
      const existing = await this.prisma.protocol.findFirst({
        where: { code: protocol.code, version: protocol.version, hospitalId: null },
      });
      const definition = protocol as unknown as Prisma.InputJsonValue;
      if (existing) {
        await this.prisma.protocol.update({
          where: { id: existing.id },
          data: { definition, name: protocol.name, specialty: protocol.specialty },
        });
        continue;
      }
      await this.prisma.protocol.create({
        data: {
          code: protocol.code,
          version: protocol.version,
          name: protocol.name,
          specialty: protocol.specialty,
          definition,
          hospitalId: null,
        },
      });
    }
    this.logger.log(`Protocolos base sincronizados: ${PROTOCOLS.map((p) => p.code).join(', ')}`);
  }

  /** Protocolos con el resumen operativo que consume el dashboard. */
  async findAll(hospitalId: string) {
    const stored = await this.prisma.protocol.findMany({
      where: { OR: [{ hospitalId: null }, { hospitalId }], active: true },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });

    return stored.map((record) => {
      const definition = record.definition as unknown as Protocol;
      return {
        id: record.id,
        code: record.code,
        version: record.version,
        name: record.name,
        specialty: record.specialty,
        hospitalId: record.hospitalId,
        approvedAt: record.approvedAt,
        checkInDays: definition.checkInDays ?? [],
        questionCount: definition.questions?.length ?? 0,
        ruleCount: (definition.rules?.length ?? 0) + GLOBAL_RULES.length,
        diagnosisKeywords: definition.diagnosisKeywords ?? [],
        redFlagsForPatient: definition.redFlagsForPatient ?? [],
      };
    });
  }

  /** Detalle con todas las reglas aplicables (base global + propias). */
  async findOne(code: string) {
    const protocol = getProtocolByCode(code);
    if (!protocol) throw new NotFoundException(`Protocolo ${code} no encontrado`);
    const rules: ClinicalRule[] = [...GLOBAL_RULES, ...protocol.rules];
    return { ...protocol, applicableRules: rules };
  }

  /** Reglas globales, publicadas para revision del comite medico. */
  listGlobalRules(): ClinicalRule[] {
    return GLOBAL_RULES;
  }

  resolveForDiagnosis(diagnosis: string): Protocol {
    return resolveProtocol(diagnosis);
  }

  getByCode(code: string): Protocol | undefined {
    return getProtocolByCode(code);
  }
}
