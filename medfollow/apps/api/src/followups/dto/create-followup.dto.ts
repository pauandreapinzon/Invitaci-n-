import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MedicationDto {
  @ApiProperty({ example: 'Acetaminofen' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: '500 mg' })
  @IsString()
  @Length(1, 60)
  dose!: string;

  @ApiProperty({ example: 8, description: 'Intervalo en horas' })
  @IsInt()
  @Min(1)
  @Max(168)
  frequencyHours!: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays!: number;

  @ApiPropertyOptional({ example: 'Tomar con alimentos' })
  @IsOptional()
  @IsString()
  @Length(0, 300)
  instructions?: string;
}

export class CreateFollowUpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ example: 'Faringitis viral' })
  @IsString()
  @Length(3, 300)
  diagnosisText!: string;

  @ApiPropertyOptional({ example: 'J02.9', description: 'Codigo CIE-10' })
  @IsOptional()
  @IsString()
  @Length(2, 20)
  diagnosisCode?: string;

  @ApiPropertyOptional({ example: 'Reposo, abundante liquido, control si no mejora en 5 dias' })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  instructions?: string;

  @ApiPropertyOptional({ type: [MedicationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications?: MedicationDto[];

  @ApiPropertyOptional({ description: 'Fecha de la consulta; por defecto ahora' })
  @IsOptional()
  @IsDateString()
  consultationAt?: string;

  @ApiPropertyOptional({ description: 'Dias de seguimiento; por defecto los del protocolo', example: [1, 3, 5] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @IsInt({ each: true })
  checkInDays?: number[];

  @ApiPropertyOptional({ default: true, description: 'Enviar de inmediato la explicacion del diagnostico por WhatsApp' })
  @IsOptional()
  sendWelcome?: boolean;
}
