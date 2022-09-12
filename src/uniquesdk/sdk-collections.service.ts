import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import '@unique-nft/substrate-client/tokens';
import { CollectionInfoWithSchema } from '@unique-nft/substrate-client/tokens';

@Injectable()
export class SdkCollectionService {
  public api: any;
  private logger: Logger;

  constructor(private sdk: Sdk) {
    this.logger = new Logger('SdkStageService');
    this.api = null;
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
}
