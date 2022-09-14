import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import { AccountTokensResult } from '@unique-nft/substrate-client/tokens';
import { CollectionInfoWithSchema, TokenByIdResult } from '@unique-nft/substrate-client/tokens';

import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants';
import { SdkCollectionService } from './sdk-collections.service';

@Injectable()
export class SdkTokensService {
  public sdk: Sdk;
  public api: any;
  private logger: Logger;

  constructor(
    @InjectUniqueSDK() private readonly unique: Sdk,
    @InjectKusamaSDK() private readonly kusama: Sdk,
    private readonly sdkCollections: SdkCollectionService,
  ) {
    this.logger = new Logger('SdkStageService');
  }

  connect(network = 'unique'): void {
    this.sdk = network === 'unique' ? this.unique : this.kusama;
    this.api = this.sdk.api;
  }

  /**
   * Get token by id and collection id
   * @param token
   * @param collection
   */
  async tokenData(token: number, collection: number): Promise<any> {
    return await this.sdk.tokens.get({ collectionId: collection, tokenId: token });
  }

  async tokenWithCollection(
    tokenId: number,
    collectionId: number,
  ): Promise<{
    token: TokenByIdResult;
    collection: CollectionInfoWithSchema;
  }> {
    const token = await this.tokenData(tokenId, collectionId);
    const collection = await this.sdkCollections.collectionById(collectionId);
    return {
      token,
      collection,
    };
  }

  async accountTokens(collection: number, address: string): Promise<AccountTokensResult> {
    return this.sdk.tokens.getAccountTokens({
      collectionId: collection,
      address: address,
    });
  }

  disconnect() {
    if (this.api.isReady) {
      this.api.disconnect();
    }
  }
}
