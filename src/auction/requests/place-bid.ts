import { Equals, IsDefined, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubmitTxArguments, HexString } from '@unique-nft/substrate-client/types';
import { Type } from 'class-transformer';

import { OfferEntityDto } from '../../offers/dto/offer-dto';
import { TxInfo } from '../../types';
import { SignerPayload } from './signer-payload.dto';

export type PlaceBidRequest = Pick<OfferEntityDto, 'collectionId' | 'tokenId'> & SubmitTxArguments;

export class PlaceBidRequestDto implements PlaceBidRequest {
  @ApiProperty({ example: 1 })
  collectionId: number;

  @ApiProperty({ example: 2 })
  tokenId: number;

  @ApiProperty({ example: '0x0000000000000000000000000000000000000000' })
  signature: HexString;

  @ApiProperty({ type: SignerPayload })
  signerPayloadJSON: SignerPayload;
}

export interface BalanceTransferTxInfo extends TxInfo {
  isSigned: true;
  signerAddress: string;
  method: 'transferKeepAlive';
  section: 'balances';
  args: {
    dest: any;
    value: string;
  };
}

class BalanceTransferTxArgsDto {
  @IsDefined()
  @IsString()
  dest: any;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class BalanceTransferTxInfoDto implements BalanceTransferTxInfo {
  @Equals(true, { message: 'tx must be signed' })
  isSigned: true;

  @IsString()
  @IsNotEmpty()
  signerAddress: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => BalanceTransferTxArgsDto)
  args: BalanceTransferTxArgsDto;

  @Equals('transferKeepAlive')
  method: 'transferKeepAlive';

  @Equals('balances')
  section: 'balances';
}
