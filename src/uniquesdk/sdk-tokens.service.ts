import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import '@unique-nft/substrate-client/tokens';
import { NestedToken } from '@unique-nft/substrate-client/tokens';

export type BundleType = {
  collectionId: number;
  tokenId: number;
};
@Injectable()
export class SdkTokensService {
  public api: any;
  private logger: Logger;

  constructor(private sdk: Sdk) {
    this.logger = new Logger('SdkTokensService');
    this.api = sdk.api;
  }

  /**
   * Get token by id and collection id
   * @param token
   * @param collection
   */
  async tokenData(token: number, collection: number): Promise<any> {
    return await this.sdk.tokens.get_new({ collectionId: collection, tokenId: token });
  }
  /**
   * Check if token is bundle
   * @param token
   * @param collection
   * @returns {Boolean}
   */
  async isBundle(token: number, collection: number): Promise<boolean> {
    try {
      return await this.sdk.tokens.isBundle({ collectionId: collection, tokenId: token });
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }
  /**
   * Get bundle
   * @param token
   * @param collection
   * @returns {Promise<NestedToken>}
   */
  async getBundle(token: number, collection: number): Promise<NestedToken> {
    try {
      return await this.sdk.tokens.getBundle({ collectionId: collection, tokenId: token });
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async accountTokens(collection: number, address: string): Promise<any> {
    return await this.sdk.tokens.getAccountTokens({
      collectionId: collection,
      address: address,
    });
  }

  public serializeBunlde(bundle: NestedToken): Array<BundleType> {
    function recurseBundle(bundle: NestedToken): Array<BundleType> {
      if (bundle?.nestingChildTokens) {
        if (Array.isArray(bundle.nestingChildTokens)) {
          const items = [
            {
              collectionId: +bundle.collectionId,
              tokenId: +bundle.tokenId,
            },
          ];
          bundle.nestingChildTokens.forEach((child) => {
            items.push(...recurseBundle(child));
          });
          return items;
        } else {
          return [
            {
              collectionId: +bundle.collectionId,
              tokenId: +bundle.tokenId,
            },
            ...recurseBundle(bundle.nestingChildTokens),
          ];
        }
      } else {
        return [
          {
            collectionId: +bundle.collectionId,
            tokenId: +bundle.tokenId,
          },
        ];
      }
    }

    return [...new Set(recurseBundle(bundle))];
  }
}
