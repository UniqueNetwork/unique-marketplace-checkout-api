import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import { AccountTokensResult, UniqueTokenToCreateEx } from '@unique-nft/substrate-client/tokens';
import { CollectionInfoWithSchema, TokenByIdResult } from '@unique-nft/substrate-client/tokens';

import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants';
import { SdkCollectionService } from './sdk-collections.service';
import { Address, ISubmittableResult, SubmittableResultCompleted, TokenIdArguments } from '@unique-nft/substrate-client/types';
import { Account } from '@unique-nft/accounts';
import { KeyringPair } from '@polkadot/keyring/types';
import { SdkExtrinsicService } from './sdk-extrinsic.service';

@Injectable()
export class SdkTokensService {
  public sdk: Sdk;
  public api: any;
  private logger: Logger;

  constructor(
    @InjectUniqueSDK() private readonly unique: Sdk,
    @InjectKusamaSDK() private readonly kusama: Sdk,
    private readonly sdkCollections: SdkCollectionService,
    private readonly sdkExtrinsic: SdkExtrinsicService,
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
  async tokenData(token: number, collection: number): Promise<TokenByIdResult> {
    return this.sdk.tokens.get({ collectionId: collection, tokenId: token });
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

  async createTokenToOwner(
    collectionId: number,
    data: UniqueTokenToCreateEx,
    ownerAddress: Address,
    signer: Account<KeyringPair>,
  ): Promise<SubmittableResultCompleted<TokenIdArguments>> {
    return this.sdk.tokens.create.submitWaitResult(
      { collectionId: collectionId, data, address: signer.instance.address, owner: ownerAddress },
      { signer },
    );
  }

  async createTokenToBuyer(
    tokenId: number,
    collectionId: number,
    buyerAddress: string,
    creator: Account<KeyringPair>,
  ): Promise<{
    blockNumber: bigint;
    submittableResult: ISubmittableResult;
    isCompleted: true;
    parsed: TokenIdArguments;
  }> {
    const tokenData = await this.unique.tokens.get({ collectionId, tokenId });

    const mapValues = new Map();

    Object.entries(tokenData.attributes).forEach(([key, value]) => {
      mapValues.set(key, value.rawValue);
    });

    const data = tokenData?.video
      ? {
          image: tokenData.image,
          video: tokenData.video,
          encodedAttributes: Object.fromEntries(mapValues),
        }
      : {
          image: tokenData.image,
          encodedAttributes: Object.fromEntries(mapValues),
        };

    const result = await this.createTokenToOwner(collectionId, data, buyerAddress, creator);

    const blockNumber = await this.sdkExtrinsic.getBlockNumber(result.submittableResult, this.sdk);

    return {
      ...result,
      blockNumber,
    };
  }

  disconnect() {
    if (this.api.isReady) {
      this.api.disconnect();
    }
  }
}
