import { Injectable } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import { BundleType, SdkTokensService } from '@app/uniquesdk/sdk-tokens.service';
import { SdkCollectionService } from '@app/uniquesdk/sdk-collections.service';
import { SdkTransferService } from '@app/uniquesdk/sdk-transfer.service';
import { SdkBalanceService } from '@app/uniquesdk/sdk-balance.service';
import '@unique-nft/substrate-client/state-queries';
import '@unique-nft/substrate-client/tokens';
import '@unique-nft/substrate-client/balance';
import '@unique-nft/substrate-client/extrinsics';
import { SdkStateService } from './sdk-state.service';
import { CollectionInfoWithSchema, TokenByIdResult } from '@unique-nft/substrate-client/tokens';

@Injectable()
export class SdkProvider {
  public sdk: Sdk;
  public api;
  public tokensService: SdkTokensService;
  public collectionsService: SdkCollectionService;
  public transferService: SdkTransferService;
  public balanceService: SdkBalanceService;
  public stateService: SdkStateService;

  constructor(sdk: Sdk) {
    this.sdk = sdk;
    this.api = sdk.api;
    this.tokensService = new SdkTokensService(sdk);
    this.collectionsService = new SdkCollectionService(sdk);
    this.transferService = new SdkTransferService(sdk);
    this.balanceService = new SdkBalanceService(sdk);
    this.stateService = new SdkStateService(sdk);
  }

  disconnect() {
    if (this.sdk.api.isReady) {
      this.sdk.api.disconnect();
    }
  }

  /**
   * Get token by id and collection id
   * @param tokenId
   * @param collectionId
   */
  async tokenWithCollection(
    tokenId: number,
    collectionId: number,
  ): Promise<{
    token: TokenByIdResult;
    collection: CollectionInfoWithSchema;
    isBundle: boolean;
    serializeBunlde: Array<BundleType>;
  }> {
    const isBundle = await this.tokensService.isBundle(tokenId, collectionId);
    let token = null;
    let serializeBunlde = [];
    if (isBundle) {
      token = await this.tokensService.getBundle(tokenId, collectionId);
      serializeBunlde = this.tokensService.serializeBunlde(token);
    } else {
      token = await this.sdk.tokens.get_new({ collectionId: collectionId, tokenId: tokenId });
    }
    const collection = await this.sdk.collections.get_new({ collectionId: collectionId });
    return {
      token,
      collection,
      isBundle,
      serializeBunlde,
    };
  }
}
