import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'medico@hospital.gov.co' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Clave.Segura2026' })
  @IsString()
  @MinLength(8)
  password!: string;
}
