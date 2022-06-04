import { IsNotEmpty, IsNumber, IsEnum, Min, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { CurrencyPayName } from './types';
import { enumToArray } from './utils';

export class BulkSellNotBlockchainInputDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  collectionId: number;

  @ApiProperty({ required: false, isArray: true, type: Number })
  @IsOptional()
  @IsArray()
  tokenIds?: number[];

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiProperty({ enum: enumToArray(CurrencyPayName), enumName: 'CurrencyPayName' })
  @IsNotEmpty()
  @IsEnum(CurrencyPayName)
  currency: CurrencyPayName;
}
