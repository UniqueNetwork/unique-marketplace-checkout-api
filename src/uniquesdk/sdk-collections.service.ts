import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import '@unique-nft/substrate-client/tokens';
import { CollectionInfoWithSchema } from '@unique-nft/substrate-client/tokens';
import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants';

@Injectable()
export class SdkCollectionService {
  public sdk: Sdk;
  public api: any;
  private logger: Logger;

  constructor(@InjectUniqueSDK() private readonly unique: Sdk, @InjectKusamaSDK() private readonly kusama: Sdk) {
    this.logger = new Logger('SdkStageService');
  }

  connect(network = 'unique'): void {
    this.sdk = network === 'unique' ? this.unique : this.kusama;
    this.api = this.sdk.api;
  }

  /**
   * Get collection by id
   * @description This method receives data from the sdk at the address of the collection
   * @param {Number} id - collection id
   * @returns {Promise<CollectionInfoWithSchema>}
   */
  async collectionById(id: number): Promise<CollectionInfoWithSchema> {
    const collection = await this.sdk.collections.get_new({ collectionId: id });
    return collection;
  }

  disconnect() {
    if (this.api.isReady) {
      this.api.disconnect();
    }
  }
}
