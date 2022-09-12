import { ApiProperty } from '@nestjs/swagger';
import { SignerPayloadJSON } from '@unique-nft/substrate-client/types';

export class SignerPayload implements SignerPayloadJSON {
  @ApiProperty({ type: String, description: 'The ss-58 encoded address' })
  address: string;

  @ApiProperty({ type: String, description: 'The checkpoint hash of the block, in hex' })
  blockHash: string;

  @ApiProperty({ type: String, description: 'The checkpoint block number, in hex' })
  blockNumber: string;

  @ApiProperty({ type: String, description: 'The era for this transaction, in hex' })
  era: string;

  @ApiProperty({ type: String, description: 'The genesis hash of the chain, in hex' })
  genesisHash: string;

  @ApiProperty({ type: String, description: 'The encoded method (with arguments) in hex' })
  method: string;

  @ApiProperty({ type: String, description: 'The nonce for this transaction, in hex' })
  nonce: string;

  @ApiProperty({ type: String, description: 'The current spec version for the runtime' })
  specVersion: string;

  @ApiProperty({ type: String, description: 'The tip for this transaction, in hex' })
  tip: string;

  @ApiProperty({ type: String, description: 'The current transaction version for the runtime' })
  transactionVersion: string;

  @ApiProperty({ type: [String], description: 'The applicable signed extensions for this runtime' })
  signedExtensions: string[];

  @ApiProperty({ type: Number, description: 'The version of the extrinsic we are dealing with' })
  version: number;
}
