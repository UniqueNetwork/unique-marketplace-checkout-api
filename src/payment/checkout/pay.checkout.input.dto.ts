import { IsNotEmpty, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayCheckoutInputDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tokenCard: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  transferAddress: string;  

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  tokenId: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  collectionId: number;  
}
