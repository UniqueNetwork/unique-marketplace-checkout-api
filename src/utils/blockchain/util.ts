import { ApiPromise } from '@polkadot/api';
import { IKeyringPair } from '@polkadot/types/types';

import { signTransaction, TransactionStatus } from './signTransaction';

import { HelperService } from '@app/helpers/helper.service';

type CrossAccountId =
  | {
      Substrate: string;
    }
  | {
      Ethereum: string;
    };

interface TokenParams {
  collectionId: bigint;
  owner: CrossAccountId | string;
  constData?: string;
  variableData?: string;
}

interface CollectionParams {
  name: string;
  description: string;
  tokenPrefix: string;
  modeprm?: any;
}

class UniqueExplorer {
  api;
  collection;
  admin: IKeyringPair;

  constructor(api: ApiPromise, admin: IKeyringPair, private helperService: HelperService) {
    this.api = api;
    this.admin = admin;
  }

  async getCollectionSchema(collectionId) {
    return (this.collection = this.api.rpc.unique.collectionById(collectionId));
  }

  async createCollection(options: CollectionParams, label = 'new collection') {
    if (typeof options.modeprm === 'undefined') options.modeprm = { nft: null };
    const helper = this.helperService;
    const creationResult = await signTransaction(
      this.admin,
      this.api.tx.unique.createCollection(
        helper.str2vec(options.name),
        helper.str2vec(options.description),
        helper.str2vec(options.tokenPrefix),
        options.modeprm,
      ),
      'api.tx.unique.createCollection',
    );
    if (creationResult.status !== TransactionStatus.SUCCESS) {
      throw Error(`Unable to create collection for ${label}`);
    }

    let collectionId = null;
    creationResult.result.events.forEach(({ event: { data, method, section } }) => {
      if (section === 'common' && method === 'CollectionCreated') {
        collectionId = parseInt(data[0].toString(), 10);
      }
    });

    if (collectionId === null) {
      throw Error(`No CollectionCreated event for ${label}`);
    }

    return collectionId;
  }

  async createToken(options: TokenParams, label = 'new token') {
    const creationResult = await signTransaction(
      this.admin,
      this.api.tx.unique.createItem(
        options.collectionId,
        typeof options.owner === 'string' ? { Substrate: options.owner } : options.owner,
        {
          nft: { const_data: options.constData, variable_data: options.variableData },
        },
      ),
      'api.tx.unique.createItem',
    );
    if (creationResult.status !== TransactionStatus.SUCCESS) {
      throw Error(`Unable to create token for ${label}`);
    }
    let success = false,
      createdCollectionId = null,
      tokenId = null,
      recipient = null;
    creationResult.result.events.forEach(({ event: { data, method, section } }) => {
      if (method === 'ExtrinsicSuccess') {
        success = true;
      } else if (section === 'common' && method === 'ItemCreated') {
        createdCollectionId = parseInt(data[0].toString(), 10);
        tokenId = parseInt(data[1].toString(), 10);
        recipient = data[2].toJSON();
      }
    });
    return { success, tokenId, recipient, collectionId: createdCollectionId };
  }

  async burnToken({ collectionId, tokenId }) {
    await signTransaction(this.admin, this.api.tx.unique.burnItem(collectionId, tokenId, 1), 'api.tx.unique.burnItem');
    return !(await this.api.rpc.unique.tokenExists(collectionId, tokenId)).toJSON();
  }
}

export { UniqueExplorer };
