import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RiskLevel } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryPatientsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ description: 'Busqueda por nombre' })
  @IsOptional()
  @IsString()
  search?: string;
}
