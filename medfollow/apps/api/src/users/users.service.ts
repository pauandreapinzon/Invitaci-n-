import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, user: RequestUser) {
    const email = dto.email.toLowerCase().trim();
    if (dto.role === Role.DOCTOR && !dto.licenseNumber) {
      throw new BadRequestException('El registro medico es obligatorio para el rol DOCTOR (Ley 23 de 1981)');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('El correo ya esta registrado');

    const created = await this.prisma.user.create({
      data: {
        hospitalId: user.hospitalId,
        email,
        passwordHash: await AuthService.hashPassword(dto.password),
        fullName: dto.fullName.trim(),
        role: dto.role,
        licenseNumber: dto.licenseNumber ?? null,
      },
      select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true },
    });

    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_CREATED',
      resource: 'User',
      resourceId: created.id,
      metadata: { role: created.role },
    });
    return created;
  }

  findAll(user: RequestUser) {
    return this.prisma.user.findMany({
      where: { hospitalId: user.hospitalId, active: true },
      select: { id: true, email: true, fullName: true, role: true, licenseNumber: true, lastLoginAt: true },
      orderBy: { fullName: 'asc' },
    });
  }
}
