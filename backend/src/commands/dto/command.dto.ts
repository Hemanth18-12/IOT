import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class DoorCommandDto {
  @ApiPropertyOptional({
    description: 'Explicit user confirmation flag for physical door lock actuation',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @ApiPropertyOptional({ description: 'Optional audit note' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
