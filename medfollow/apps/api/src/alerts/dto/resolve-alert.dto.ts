import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResolveAlertDto {
  @ApiProperty({ example: 'Paciente contactado, se indico acudir a urgencias. Caso cerrado.' })
  @IsString()
  @Length(5, 1000)
  resolutionNote!: string;
}
