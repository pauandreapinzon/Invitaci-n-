import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restringe el acceso a los roles indicados (control de acceso basado en roles). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
