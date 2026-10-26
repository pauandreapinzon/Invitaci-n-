import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'Juan Perez Gomez' })
  @IsString()
  @Length(3, 160)
  fullName!: string;

  @ApiPropertyOptional({ example: 'CC', enum: ['CC', 'TI', 'CE', 'PA', 'RC'] })
  @IsOptional()
  @IsIn(['CC', 'TI', 'CE', 'PA', 'RC'])
  documentType?: string;

  @ApiProperty({ example: '1020304050', description: 'Se almacena cifrado (AES-256-GCM)' })
  @IsString()
  @Length(5, 20)
  documentId!: string;

  @ApiProperty({ example: '+573001234567', description: 'Telefono WhatsApp en E.164; se almacena cifrado' })
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'telefono invalido' })
  phone!: string;

  @ApiPropertyOptional({ example: '1985-04-12' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'F', enum: ['F', 'M', 'O'] })
  @IsOptional()
  @IsIn(['F', 'M', 'O'])
  sex?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  pregnant?: boolean;

  @ApiPropertyOptional({ example: ['DIABETES', 'HTA'], description: 'Codigos de comorbilidad' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  comorbidities?: string[];
}
