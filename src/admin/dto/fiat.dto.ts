import { HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max, IsOptional, IsArray, IsNotEmpty, IsNumber, Min, IsEnum } from 'class-validator';

import { enumToArray } from '@app/utils';

import { U32_MAX_VALUE } from '../constants';

import { CurrencyNames } from '@app/types';

export class MassFiatSaleDTO {
  @ApiProperty({ example: 1 })
  @Max(U32_MAX_VALUE)
  @IsPositive()
  @IsInt()
  collectionId: number;

  @ApiProperty({ example: 0.05, description: 'Min value is 0.01' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiProperty({ required: false, isArray: true, type: Number, example: [1] })
  @IsOptional()
  @IsArray()
  tokenIds?: number[];

  @ApiProperty({ enum: enumToArray(CurrencyNames), enumName: 'CurrencyNames' })
  @IsNotEmpty()
  @IsEnum(CurrencyNames)
  currency: CurrencyNames;
}

export class MassFiatSaleResultDto {
  @ApiProperty({ default: HttpStatus.OK })
  statusCode = HttpStatus.OK;
  @ApiProperty()
  message: string;
  @ApiProperty()
  tokenIds: number[];
}

export class MassCancelFiatResult {
  @ApiProperty({ default: HttpStatus.OK })
  statusCode = HttpStatus.OK;
  @ApiProperty({ example: '{count} offers successfully canceled' })
  message: string;
}
