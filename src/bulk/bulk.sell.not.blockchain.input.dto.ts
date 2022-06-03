import { IsNotEmpty, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { CurrencyPayName } from './types';
import { enumToArray } from './utils';

export class BulkSellNotBlockchainInputDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  collectionId: number;

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
