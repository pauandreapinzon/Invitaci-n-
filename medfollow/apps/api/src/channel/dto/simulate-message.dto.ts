import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class SimulateMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ example: 'Tengo 39 grados y me cuesta respirar, me siento peor que ayer' })
  @IsString()
  @Length(1, 1500)
  text!: string;
}
