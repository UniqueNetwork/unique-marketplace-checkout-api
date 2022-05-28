import { IsNotEmpty, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayCheckoutInputDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tokenCard: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  tokenId: number;
}
