import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class VitalsDto {
  @ApiPropertyOptional({ example: 38.7 })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperatureC?: number;

  @ApiPropertyOptional({ example: 96 })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(250)
  heartRate?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  respiratoryRate?: number;

  @ApiPropertyOptional({ example: 95 })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(100)
  spo2?: number;

  @ApiPropertyOptional({ example: 118 })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(280)
  systolicBp?: number;

  @ApiPropertyOptional({ example: 76 })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp?: number;

  @ApiPropertyOptional({ example: 110 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(800)
  glucoseMgDl?: number;
}

export class CreateSymptomDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional({ example: 'FEVER', description: 'Codigo del catalogo clinico' })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  code?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  present?: boolean;

  @ApiPropertyOptional({ enum: ['MILD', 'MODERATE', 'SEVERE'] })
  @IsOptional()
  @IsIn(['MILD', 'MODERATE', 'SEVERE'])
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';

  @ApiPropertyOptional({ enum: ['IMPROVING', 'STABLE', 'WORSENING'] })
  @IsOptional()
  @IsIn(['IMPROVING', 'STABLE', 'WORSENING'])
  trend?: 'IMPROVING' | 'STABLE' | 'WORSENING';

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  onsetDays?: number;

  @ApiPropertyOptional({ example: 'Referido por enfermeria en llamada de control' })
  @IsOptional()
  @IsString()
  @Length(0, 400)
  note?: string;

  @ApiPropertyOptional({ type: VitalsDto })
  @IsOptional()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @ApiPropertyOptional({ description: 'Dosis omitidas reportadas en el periodo' })
  @IsOptional()
  @IsInt()
  @Min(0)
  missedDoses?: number;

  @ApiPropertyOptional({ description: 'Dosis programadas en el periodo' })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalDoses?: number;
}
