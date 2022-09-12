import { BadRequestException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Bid, BidStatus, TypeAttributToken } from '../types';

import { OfferAttributes, OfferAttributesDto, OfferEntityDto, OffersFilter, OfferTraits, TraitDto } from './dto';
import { AuctionBidEntity, Collection, OffersEntity, SearchIndex } from '../entity';

import { PaginationRequest } from '../utils/pagination/pagination-request';
import { PaginationResultDto } from '../utils/pagination/pagination-result';
import { OfferSortingRequest } from '../utils/sorting/sorting-request';
import { InjectSentry, SentryService } from '../utils/sentry';
import { OffersFilterService } from './offers-filter.service';
import { OffersFilterType, OffersItemType } from './types';
import { CollectionService } from '@app/database/collection.service';

@Injectable()
export class OffersService {
  private logger: Logger;

  constructor(
    private connection: DataSource,
    @InjectSentry() private readonly sentryService: SentryService,
    private readonly offersFilterService: OffersFilterService,
    private readonly collectionService: CollectionService,
  ) {
    this.logger = new Logger(OffersService.name);
  }
  /**
   * Get Offers
   * @description Returns sales offers in JSON format
   * @param {PaginationRequest} pagination - Paginate {page: 1, pageSize: 10}
   * @param {OffersFilter} offersFilter - DTO Offer filter
   * @param {OfferSortingRequest} sort - Possible values: asc(Price), desc(Price), asc(TokenId), desc(TokenId), asc(CreationDate), desc(CreationDate)
   */
  async get(
    pagination: PaginationRequest,
    offersFilter: OffersFilter,
    sort: OfferSortingRequest,
  ): Promise<PaginationResultDto<OfferEntityDto>> {
    let offers;
    let items = [];
    let auctionIds: Array<number> = [];
    let bids = [];
    let searchIndex = [];
    let collections = [];

    try {
      offers = await this.offersFilterService.filter(offersFilter, pagination, sort);
      auctionIds = this.auctionIds(offers.items);
      bids = await this.bids(auctionIds);
      searchIndex = await this.searchIndex(this.parserCollectionIdTokenId(offers.items));
      collections = await this.collectionService.collections(this.getCollectionIds(offers.items));

      items = this.parseItems(offers.items, bids, searchIndex, collections) as any as Array<OffersEntity>;
    } catch (e) {
      this.logger.error(e.message);
      this.sentryService.instance().captureException(new BadRequestException(e), {
        tags: { section: 'offers' },
      });
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Something went wrong!',
        error: e.message,
      });
    }

    return new PaginationResultDto(OfferEntityDto, {
      page: offers.page,
      pageSize: offers.pageSize,
      itemsCount: offers.itemsCount,
      items: items.map(OfferEntityDto.fromOffersEntity),
      attributes: offers.attributes as Array<TraitDto>,
      attributesCount: offers.attributesCount,
    });
  }

  private auctionIds(items: Array<any>): Array<number> {
    return items.filter((item) => item?.offer_type == 'Auction').map((item) => item?.offer_id);
  }

  private async bids(auctionIds: Array<number>): Promise<Array<Partial<Bid>>> {
    const queryBuilder = this.connection.manager
      .createQueryBuilder(AuctionBidEntity, 'bid')
      .select(['created_at', 'updated_at', 'amount', 'auction_id', 'bidder_address', 'balance', 'status'])
      .where('bid.amount > 0')
      .andWhere('bid.status != :status', { status: BidStatus.error })
      .orderBy('bid.created_at', 'DESC');

    if (Array.isArray(auctionIds) && auctionIds?.length > 0) {
      queryBuilder.andWhere('bid.auction_id in (:...auctionIds)', {
        auctionIds,
      });
    }

    const source = await queryBuilder.execute();

    return source.map((item) => {
      return {
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        auctionId: item.auction_id,
        balance: item.balance,
        amount: item.amount,
        bidderAddress: item.bidder_address,
      };
    });
  }

  private parserCollectionIdTokenId(items: Array<any>): string | null {
    const values = items.map((item) => {
      return `(${Number(item.collection_id)}, ${Number(item.token_id)})`;
    });
    if (values.length > 0) {
      return `select * from (values ${values.join(',')}) as t (collection_id, token_id)`;
    }
    return null;
  }

  private getCollectionIds(items: Array<any>): Array<number> {
    return [...new Set(items.map((item) => +item.collection_id))].filter((id) => id !== null && id !== 0);
  }

  private async searchIndex(sqlValues: string): Promise<Array<Partial<SearchIndex>>> {
    if (sqlValues) {
      const result = await this.connection.manager.query(
        `select
            si.collection_id,
            si.token_id,
            si.attributes
        from search_index si  inner join (${sqlValues}) t on
        t.collection_id = si.collection_id and
        t.token_id = si.token_id;`,
      );
      return result as Array<Partial<SearchIndex>>;
    }
    return [];
  }

  private parseItems(
    items: Array<OffersFilterType>,
    bids: Partial<Bid>[],
    searchIndex: Partial<SearchIndex>[],
    collections: Array<Collection>,
  ): Array<OffersItemType> {
    function convertorFlatToObject(): (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any {
      return (acc, item) => {
        const token = searchIndex.find((index) => index.collection_id === item.collection_id && index.token_id === item.token_id);
        const collection = collections.find((collection) => collection.id === item.collection_id);
        const obj = {
          collection_id: +item.collection_id,
          token_id: +item.token_id,
          status: item.offer_status,
          type: item.offer_type,
          price: item.offer_price,
          currency: +item.offer_currency,
          address_from: item.offer_address_from,
          created_at: new Date(item.offer_created_at_ask),
          auction: null,
          tokenDescription: token ? token?.attributes : null,
          collectionDescription: {
            mode: collection?.mode,
            name: collection?.name,
            description: collection?.description,
            tokenPrefix: collection?.tokenPrefix,
            id: collection?.id,
            owner: collection?.owner,
            schema: {
              attributesSchemaVersion: collection?.data['schema'].attributesSchemaVersion,
              coverPicture: collection?.data['schema'].coverPicture,
              image: collection?.data['schema'].image,
              schemaName: collection?.data['schema'].schemaName,
              schemaVersion: collection?.data['schema'].schemaVersion,
              collectionId: collection?.data['schema'].collectionId,
            },
          },
        };

        if (item.offer_type === 'Auction') {
          obj.auction = Object.assign(
            {},
            {
              id: item.auction_id,
              createdAt: new Date(item.auction_created_at),
              updatedAt: new Date(item.auction_updated_at),
              priceStep: item.auction_price_step,
              startPrice: item.auction_start_price,
              status: item.auction_status,
              stopAt: new Date(item.auction_stop_at),
              bids: bids.filter((bid) => bid.auctionId === item.auction_id) as any as AuctionBidEntity[],
            },
          );
        }

        acc.push(obj);
        return acc;
      };
    }

    return items.reduce(convertorFlatToObject(), []);
  }

  async getOne(filter: { collectionId: number; tokenId: number }): Promise<OfferEntityDto | null> {
    const { collectionId, tokenId } = filter;

    const source = await this.offersFilterService.filterByOne(collectionId, tokenId);
    const bids = await this.bids(this.auctionIds(source));

    const searchIndex = await this.searchIndex(this.parserCollectionIdTokenId(source));
    const collections = await this.collectionService.collections(this.getCollectionIds(source));

    const offers = this.parseItems(source, bids, searchIndex, collections).pop() as any as OffersEntity;

    return offers && OfferEntityDto.fromOffersEntity(offers);
  }

  public get isConnected(): boolean {
    return true;
  }

  async getAttributes(collectionId: number): Promise<OfferTraits | null> {
    try {
      return this.offersFilterService.attributes(collectionId);
    } catch (e) {
      this.logger.error(e.message);
      this.sentryService.instance().captureException(new BadRequestException(e), {
        tags: { section: 'get_traits' },
      });
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Something went wrong!',
        error: e.message,
      });
    }
  }

  async getAttributesCounts(args: OfferAttributesDto): Promise<Array<OfferAttributes>> {
    try {
      if ((args.collectionId ?? []).length <= 0) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Not found collectionIds. Please set collectionIds',
        });
      }
      return this.offersFilterService.attributesCount(args.collectionId);
    } catch (e) {
      this.logger.error(e.message);
    }
  }
}
