import type { Hash } from '@polkadot/types/interfaces/runtime';

export interface IObject {
  [key: string]: any | string | boolean | number | Array<any> | bigint | IObject | IObject[] | Record<string, any> | undefined;
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
