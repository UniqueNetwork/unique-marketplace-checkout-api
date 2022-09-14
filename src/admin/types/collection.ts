import { Collection } from '../../entity';
import { CollectionMode } from '@unique-nft/substrate-client/tokens';

export enum CollectionStatus {
  Enabled = 'Enabled',
  Disabled = 'Disabled',
}

export enum CollectionImportType {
  Env = 'Env',
  Api = 'Api',
}

export type DecodedCollection = {
  owner: string;
  mode: CollectionMode;
  tokenPrefix: string;
  name: string;
  description: string;
  data: any;
};

export type ImportByIdResult = {
  collection: Collection;
  message: string;
};
