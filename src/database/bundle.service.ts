import { OfferFilters, SearchIndex } from '@app/entity';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

type Pair = {
  collectionId: number;
  tokenId: number;
};

type PairOffer = {
  offer_id: string;
  collection_id: number;
  token_id: number;
};

@Injectable()
export class BundleService {
  private logger: Logger;
  private searchIndex: Repository<SearchIndex>;

  constructor(private connection: DataSource) {
    this.searchIndex = this.connection.getRepository(SearchIndex);
    this.logger = new Logger(BundleService.name, { timestamp: true });
  }

  public async bundle(
    collectionId: number,
    tokenId: number,
  ): Promise<{
    collectionId: number;
    tokenId: number;
  }> {
    let offer = await this.checkOffer([{ collectionId, tokenId }]);
    if (offer.length === 0) {
      const ids = await this.ids(collectionId, tokenId);
      offer = await this.checkOffer(ids);
      const item = offer.pop();
      return {
        collectionId: +item.collection_id,
        tokenId: +item.token_id,
      };
    }
    return {
      collectionId,
      tokenId,
    };
  }

  // select distinct collection_id, token_id
  //from search_index
  //where nested @? '$[*] ? (@.collectionId == 735 && @.tokenId == 38)'

  private async ids(collectionId: number, tokenId: number): Promise<Array<{ collectionId; tokenId }>> {
    const ids = await this.connection.manager
      .createQueryBuilder()
      .select(['collection_id', 'token_id'])
      .distinct()
      .from(SearchIndex, 'search_index')
      .where('search_index.nested @? :nested', { nested: `$[*] ? (@.collectionId == ${+collectionId} && @.tokenId == ${+tokenId})` })
      .getRawMany();
    return ids.map((item) => {
      return {
        collectionId: +item.collection_id,
        tokenId: +item.token_id,
      };
    });
  }

  private async checkOffer(items: Array<Pair>): Promise<Array<PairOffer>> {
    const collections = items.map((item) => item.collectionId);
    const tokens = items.map((item) => item.tokenId);

    return this.connection.manager
      .createQueryBuilder(OfferFilters, 'v_offers_search')
      .select(['offer_id', 'collection_id', 'token_id'])
      .distinct()
      .where('v_offers_search.collection_id in (:...collectionId)', { collectionId: collections })
      .andWhere('v_offers_search.token_id in (:...tokenId)', { tokenId: tokens })
      .andWhere('v_offers_search.offer_status in (:...status)', { status: ['active', 'removed_by_admin'] })
      .getRawMany();
  }
}
