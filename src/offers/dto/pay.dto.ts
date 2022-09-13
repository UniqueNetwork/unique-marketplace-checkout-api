import { IsNotEmpty, IsString, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayOfferDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tokenCard: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  buyerAddress: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tokenId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  collectionId: string;
}

export class PayOfferResponseDto {
  @ApiProperty()
  @IsBoolean()
  isOk: boolean;
}
