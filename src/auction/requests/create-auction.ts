import { Equals, IsIn, IsDefined, IsNotEmpty, IsString, ValidateNested, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SubmitTxArguments, HexString } from '@unique-nft/substrate-client/types';

import { TxInfo } from '../../types';
import { IsBigInt, BigIntGte } from '../../offers/decorators/bigint';
import { SignerPayload } from './signer-payload.dto';

export type CreateAuctionRequest = {
  startPrice: bigint;
  priceStep: bigint;
  days: number;
  minutes?: number;
} & SubmitTxArguments;

const ToBigInt = Transform(({ value }: { value: any }): bigint | any => {
  try {
    return BigInt(value);
  } catch (error) {
    return value;
  }
});

export class CreateAuctionRequestDto implements CreateAuctionRequest {
  @IsOptional()
  collectionId: string;

  @IsOptional()
  tokenId: string;

  @IsOptional()
  ownerAddress: string;

  @ApiProperty({ example: '100' })
  @ToBigInt
  @IsBigInt()
  @BigIntGte(1n)
  startPrice: bigint;

  @ApiProperty({ example: '10' })
  @ToBigInt
  @IsBigInt()
  @BigIntGte(1n)
  priceStep: bigint;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(21)
  days: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  minutes: number;

  @ApiProperty({ example: '0x0000000000000000000000000000000000000000' })
  signature: HexString;

  @ApiProperty({ type: SignerPayload })
  signerPayloadJSON: SignerPayload;
}

export interface TokenTransferTxInfo extends TxInfo {
  isSigned: true;
  signerAddress: string;
  method: 'transfer' | 'transferFrom';
  section: 'unique';
  args: {
    collection_id: string;
    item_id: string;
    recipient: any;
    value: '1';
  };
}

class TokenTransferTxArgsDto {
  @IsDefined()
  recipient: any;

  @IsString()
  @IsNotEmpty()
  collection_id: string;

  @IsString()
  @IsNotEmpty()
  item_id: string;

  @Equals('1')
  value: '1';
}

export class TokenTransferTxInfoDto implements TokenTransferTxInfo {
  @Equals(true, { message: 'tx must be signed' })
  isSigned: true;

  @IsString()
  @IsNotEmpty()
  signerAddress: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => TokenTransferTxArgsDto)
  args: TokenTransferTxArgsDto;

  @IsIn(['transfer', 'transferFrom'])
  method: 'transfer' | 'transferFrom';

  @Equals('unique')
  section: 'unique';
}
