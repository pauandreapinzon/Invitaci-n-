import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';

@ApiTags('auditoria')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Consultar la bitacora de auditoria del hospital' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('patientId') patientId?: string,
    @Query('action') action?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.audit.list({
      hospitalId: user.hospitalId,
      patientId,
      action,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }
}
