import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MarketConfig } from '@app/config/market-config';
import { SearchIndex } from '@app/entity';

import { v4 as uuid } from 'uuid';
import { CollectionToken, TokenInfo, TypeAttributToken } from '@app/types';

import '@polkadot/api-augment/polkadot';
import { Sdk } from '@unique-nft/substrate-client';
import { InjectUniqueSDK, SdkCollectionService, SdkTokensService } from '@app/uniquesdk';

@Injectable()
export class SearchIndexService {
  private network: string;
  private repository: Repository<SearchIndex>;
  private readonly logger = new Logger(SearchIndexService.name);

  private BLOCKED_SCHEMA_KEYS = ['ipfsJson'];

  constructor(
    private connection: DataSource,
    private sdkCollections: SdkCollectionService,
    private sdkTokens: SdkTokensService,
    @InjectUniqueSDK() private uniqueApi: Sdk,
    @Inject('CONFIG') private config: MarketConfig,
  ) {
    this.network = this.config.blockchain.unique.network;
    this.repository = connection.getRepository(SearchIndex);
    this.sdkTokens.connect('unique');
    this.sdkCollections.connect('unique');
  }

  async addSearchIndexIfNotExists(collectionToken: CollectionToken): Promise<SearchIndex[]> {
    const dbIndex = await this.repository.find({
      where: {
        collection_id: String(collectionToken.collectionId),
        token_id: String(collectionToken.tokenId),
        network: collectionToken?.network || this.network,
      },
    });
    if (dbIndex.length) return dbIndex;
    const searchIndexItems = await this.getTokenInfoItems(collectionToken);
    return this.saveSearchIndex(collectionToken, searchIndexItems);
  }

  private getValueToken(attribute: any): Array<string> {
    if (Array.isArray(attribute.value)) {
      return attribute.value.map((item) => item._);
    }
    return attribute.value._ ? [attribute.value._] : [attribute.value];
  }

  private getLocation(attribute: any): string | null {
    if (Array.isArray(attribute.value)) {
      return [
        ...new Set(
          attribute.value.map((i) =>
            Object.keys(i)
              .filter((i) => i !== '_')
              .join(','),
          ),
        ),
      ].join(',');
    } else {
      if (typeof attribute.value === 'string') {
        return null;
      } else {
        return Object.keys(attribute.value)
          .filter((i) => i !== '_')
          .join(',');
      }
    }
  }

  async prepareSearchIndex(tokenId: number, collectionId: number): Promise<any> {
    const tokenData = await this.sdkTokens.tokenWithCollection(tokenId, collectionId);
    const source = new Set();

    // Collection
    source
      .add({
        locale: null,
        items: [tokenData.collection.tokenPrefix],
        key: 'prefix',
        type: TypeAttributToken.Prefix,
        is_trait: false,
      })
      .add({
        locale: null,
        items: [tokenData.collection.description],
        key: 'description',
        type: TypeAttributToken.String,
        is_trait: false,
      })
      .add({
        locale: null,
        items: [tokenData.collection.name],
        key: 'collectionName',
        type: TypeAttributToken.String,
        is_trait: false,
      })
      .add({
        locale: null,
        items: [tokenData.collection?.schema?.coverPicture?.fullUrl],
        key: 'collectionCover',
        type: TypeAttributToken.ImageURL,
        is_trait: false,
      });

    // Token
    source.add({
      locale: null,
      items: [`${tokenId}`],
      key: 'tokenId',
      type: TypeAttributToken.Number,
      is_trait: false,
    });

    if (tokenData.token?.image) {
      source.add({
        locale: null,
        items: [tokenData.token.image?.fullUrl],
        key: 'image',
        type: TypeAttributToken.ImageURL, //
        is_trait: false,
      });
    }

    if (tokenData.token?.video) {
      source.add({
        locale: null,
        items: [tokenData.token.video?.fullUrl],
        key: 'video',
        type: TypeAttributToken.VideoURL,
      });
    }

    for (const [key, object] of Object.entries(tokenData.token?.attributes)) {
      source.add({
        locale: this.getLocation(object),
        items: this.getValueToken(object),
        key: object.name?._,
        type: object.isEnum ? TypeAttributToken.Enum : TypeAttributToken.String,
        is_trait: object.isEnum,
      });
    }

    return {
      source: [...source],
      token: tokenData.token,
    };
  }

  async getTokenInfoItems({ collectionId, tokenId }: CollectionToken): Promise<TokenInfo[]> {
    const source = await this.prepareSearchIndex(tokenId, collectionId);
    return source.source;
  }

  async saveSearchIndex(collectionToken: CollectionToken, items: TokenInfo[]): Promise<SearchIndex[]> {
    const total = items
      .filter(
        (i) =>
          [TypeAttributToken.Enum, TypeAttributToken.String].includes(i.type) &&
          !['collectionCover', 'prefix', 'description', 'collectionName', 'tokenId', 'image', 'video'].includes(i.key),
      )
      .reduce((acc, item) => {
        return acc + item.items.length;
      }, 0);

    const listItems = this.setListItems(items);

    const searchIndexItems: SearchIndex[] = items.map((item) =>
      this.repository.create({
        id: uuid(),
        collection_id: String(collectionToken.collectionId),
        token_id: String(collectionToken.tokenId),
        network: collectionToken?.network || this.network,
        locale: item.locale,
        items: item.items,
        key: item.key,
        is_trait: item.is_trait,
        type: item.type,
        count_item: this.setCountItem(item),
        total_items: total,
        list_items: listItems,
      }),
    );

    return this.repository.save(searchIndexItems);
  }

  private setCountItem(item: TokenInfo): number {
    if (
      [TypeAttributToken.Enum, TypeAttributToken.String].includes(item.type) &&
      !['collectionCover', 'prefix', 'description', 'collectionName'].includes(item.key)
    ) {
      return 0;
    }
    return item.items.length;
  }

  private setListItems(items: TokenInfo[]): string[] {
    return items
      .filter(
        (i) =>
          [TypeAttributToken.Enum, TypeAttributToken.String].includes(i.type) &&
          !['collectionCover', 'prefix', 'description', 'collectionName', 'tokenId', 'image'].includes(i.key),
      )
      .reduce((acc, item) => {
        acc = [...acc, ...item.items];
        return acc;
      }, []);
  }

  async updateSearchIndex(): Promise<void> {
    for (const index of await this.repository.query(`select collection_id, token_id from search_index group by collection_id, token_id`)) {
      await this.repository
        .createQueryBuilder()
        .delete()
        .from(SearchIndex)
        .where('collection_id = :collection_id', { collection_id: index.collection_id })
        .andWhere('token_id = :token_id', { token_id: index.token_id })
        .execute();

      await this.addSearchIndexIfNotExists({
        collectionId: index?.collection_id,
        tokenId: index?.token_id,
      });
    }
  }
}
