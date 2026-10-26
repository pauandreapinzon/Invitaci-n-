import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'enfermeria@hospital.gov.co' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Clave.Segura2026' })
  @IsString()
  @Length(10, 72)
  password!: string;

  @ApiProperty({ example: 'Ana Maria Rojas' })
  @IsString()
  @Length(3, 160)
  fullName!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({ example: 'RM-123456', description: 'Registro medico (obligatorio para medicos)' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
