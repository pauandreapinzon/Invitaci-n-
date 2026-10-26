import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { LoginDto } from './dto/login.dto';

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return hash(password, 12);
  }

  async login(dto: LoginDto, context: AuthContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { hospital: { select: { id: true, name: true, timezone: true } } },
    });

    const passwordMatches = user ? await compare(dto.password, user.passwordHash) : false;
    if (!user || !user.active || !passwordMatches) {
      await this.audit.record({
        hospitalId: user?.hospitalId,
        actorId: user?.id,
        actorType: ActorType.USER,
        action: 'AUTH_LOGIN_FAILED',
        resource: 'User',
        resourceId: user?.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email: dto.email },
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      hospitalId: user.hospitalId,
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      resource: 'User',
      resourceId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const payload = { sub: user.id, email: user.email, role: user.role, hospitalId: user.hospitalId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        hospital: user.hospital,
      },
    };
  }
}
