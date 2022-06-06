import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IsOkOutputDto {
  @ApiProperty()
  @IsBoolean()
  isOk: boolean;
}
