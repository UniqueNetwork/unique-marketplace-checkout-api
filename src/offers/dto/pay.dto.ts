import { IsNotEmpty, IsString, IsBoolean, IsNumber, Min, IsEnum, Max, IsPositive, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { HexString } from '@unique-nft/substrate-client/types';

import { CurrencyNames } from '@app/types';
import { enumToArray } from '@app/utils';
import { U32_MAX_VALUE } from '@app/admin/constants';

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

export class BadRequestResponse {
  @ApiProperty({ default: HttpStatus.BAD_REQUEST })
  statusCode = HttpStatus.BAD_REQUEST;
  @ApiProperty()
  message: string;
  @ApiProperty()
  error: string;
}

export class ConflictResponse {
  @ApiProperty({ default: HttpStatus.CONFLICT })
  statusCode = HttpStatus.CONFLICT;
  @ApiProperty()
  message: string;
  @ApiProperty()
  error: string;
}

export class CreateFiatInput {
  @ApiProperty({ example: 0.05, description: 'Min value is 0.01' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiProperty({ enum: enumToArray(CurrencyNames), enumName: 'CurrencyNames' })
  @IsNotEmpty()
  @IsEnum(CurrencyNames)
  currency: CurrencyNames;

  @ApiProperty({ example: 1 })
  @Max(U32_MAX_VALUE)
  @IsPositive()
  @IsInt()
  collectionId: number;

  @ApiProperty({ description: 'Token ID', example: 4 })
  tokenId: number;
}

export class OfferFiatDto {
  @ApiProperty({ description: 'offer ID', example: 'f8096c7a-9d7d-41c0-b010-825450993928' })
  id: string;

  @ApiProperty({ description: 'Collection ID', example: 16 })
  collectionId: number;

  @ApiProperty({ description: 'Token ID', example: 4 })
  tokenId: number;

  @ApiProperty({ description: 'Price', example: '100' })
  price: string;

  @ApiProperty({ description: 'Seller storage address', example: '5CfC8HRcV5Rc4jHFHmZsSjADCMYc7zoWbvxdoNG9qwEP7aUB' })
  seller: string;
}

export class CancelFiatInput {
  @ApiProperty({ example: 1 })
  @Max(U32_MAX_VALUE)
  @IsPositive()
  @IsInt()
  collectionId: number;

  @ApiProperty({ description: 'Token ID', example: 4 })
  tokenId: number;
}
