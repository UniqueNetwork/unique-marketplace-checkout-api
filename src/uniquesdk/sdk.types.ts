import { Hash } from '@polkadot/types/interfaces';
import Web3 from 'web3';
import { WebsocketProvider } from 'web3-core';

import { SdkTokensService } from '@app/uniquesdk/sdk-tokens.service';
import { SdkCollectionService } from '@app/uniquesdk/sdk-collections.service';
import { SdkStateService } from '@app/uniquesdk/sdk-state.service';
import { SdkBalanceService } from '@app/uniquesdk/sdk-balance.service';
import { SdkTransferService } from '@app/uniquesdk/sdk-transfer.service';
import { Sdk } from '@unique-nft/substrate-client';

export interface SdkExtendsService {
  tokens: SdkTokensService;
  collections: SdkCollectionService;
  state: SdkStateService;
  balances: SdkBalanceService;
  transfer: SdkTransferService;
}

export interface SdkExt extends Sdk {
  ext: SdkExtendsService;
}

export interface IObject {
  [key: string]: any | string | boolean | number | Array<any> | bigint | IObject | IObject[] | Record<string, any> | undefined;
}

export interface IContractOptions {
  from?: string;
  gas?: number;
}

export interface IStateQueries {
  rawType: string;
  isEmpty: boolean;
  hash: string;
  json: string | boolean | number | object | Array<any> | Record<string, any>;
  human: string | boolean | number | object | Array<any> | Record<string, any>;
  hex: string;
}

export type SubmitResult = {
  isSucceed: boolean;
  blockNumber: bigint;
  blockHash: Hash;
};

export enum NetworkName {
  UNIQUE = 1,
  KUSAMA = 2,
}

export enum NetworkNameState {
  UNIQUE = 'UNIQUE',
  KUSAMA = 'KUSAMA',
}

export type TransferTokenResult = {
  collectionId: number;
  tokenId: number;
  addressFrom: string;
  addressTo: string;
  blockHash: Hash;
  blockNumber: bigint;
  isCompleted: true;
  isError: boolean;
  internalError: Error;
};

export type TransferBalanceResult = {
  isCompleted: boolean;
  isError: boolean;
  blockNumber: bigint;
  transferData: {
    sender: string;
    recipient: string;
    amount: number;
  };
};

export type Web3Connect = { web3: Web3; provider: WebsocketProvider };

export enum SponsoringMode {
  Disabled = 0,
  Allowlisted = 1,
  Generous = 2,
}
