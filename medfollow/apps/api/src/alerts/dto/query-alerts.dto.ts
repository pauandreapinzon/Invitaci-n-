import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AlertStatus, RiskLevel } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryAlertsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AlertStatus, isArray: false })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  level?: RiskLevel;
}
