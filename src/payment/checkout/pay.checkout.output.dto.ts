import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayCheckoutOutputDto {
  @ApiProperty()
  @IsBoolean()
  isOk: boolean;
}
