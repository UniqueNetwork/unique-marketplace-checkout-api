import { CollectionImportType } from '@app/admin/types';
import { CollectionMode } from '@unique-nft/substrate-client/tokens';

export type DecodedCollection = {
  owner: string;
  mode: CollectionMode;
  importType: CollectionImportType;
  tokenPrefix: string;
  name: string;
  description: string;
  data: any;
};
