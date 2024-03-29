import { BadRequestException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { nullOrWhitespace } from '../utils/string/null-or-white-space';
import { PaginationRequest } from '../utils/pagination/pagination-request';
import { PaginationResult, PaginationResultDto } from '../utils/pagination/pagination-result';
import { equalsIgnoreCase } from '../utils/string/equals-ignore-case';
import { SortingOrder } from '../utils/sorting/sorting-order';
import { TradeSortingRequest } from '../utils/sorting/sorting-request';
import { paginate } from '../utils/pagination/paginate';
import { MarketTradeDto, TradesFilter } from './dto';
import { AuctionBidEntity, MarketTrade, OffersEntity, SearchIndex } from '../entity';
import { IMarketTrade } from './interfaces';
import { InjectSentry, SentryService } from '../utils/sentry';
import { SellingMethod } from '../types';
import { uuidValidateV4 } from '../utils/uuid';

@Injectable()
export class TradesService {
  private offerSortingColumns = ['Price', 'TokenId', 'CollectionId', 'CreationDate', 'Status', 'originPrice'];
  private sortingColumns = [...this.offerSortingColumns, 'TradeDate'];
  private logger: Logger;

  constructor(private connection: DataSource, @InjectSentry() private readonly sentryService: SentryService) {
    this.logger = new Logger(TradesService.name);
  }

  /**
   * Retrieving trade data
   *
   * @param {Array<number>} collectionIds - collection ID
   * @param {String} seller - Seller Hash
   * @param {PaginationRequest} paginationRequest  - { page: 1 , pageSize: 10}
   * @param {TradeSortingRequest} sort - Possible values: asc(Price), desc(Price), asc(TokenId), desc(TokenId), asc(CollectionId), desc(CollectionId), asc(TradeDate), desc(TradeDate).
   * @see TradesController.get
   * @return ({Promise<PaginationResult<MarketTradeDto>>})
   */
  async get(
    tradesFilter: TradesFilter,
    accountId: string | undefined,
    paginationRequest: PaginationRequest,
    sort: TradeSortingRequest,
  ): Promise<PaginationResult<MarketTradeDto>> {
    let tradesQuery: SelectQueryBuilder<IMarketTrade>;
    let paginationResult;
    try {
      tradesQuery = this.connection.manager.createQueryBuilder(MarketTrade, 'trade');
      this.addRelations(tradesQuery);

      tradesQuery = this.filterByCollectionIds(tradesQuery, tradesFilter.collectionId);
      tradesQuery = this.filterByTokenIds(tradesQuery, tradesFilter.tokenId);
      tradesQuery = this.filterByAccountId(tradesQuery, accountId);
      tradesQuery = this.filterBySearchText(tradesQuery, tradesFilter.searchText);
      tradesQuery = this.filterByTraits(tradesQuery, tradesFilter.traits, tradesFilter.collectionId);
      tradesQuery = this.filterByStatus(tradesQuery, tradesFilter.status);
      tradesQuery = this.applySort(tradesQuery, sort);

      paginationResult = await paginate(tradesQuery, paginationRequest);
    } catch (e) {
      this.logger.error(e);
      this.sentryService.instance().captureException(new BadRequestException(e), {
        tags: { section: 'market_trade' },
      });
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'Something went wrong! Perhaps there is no table [market_trade] in the database, the sequence of installation and configuration or failure to sort or filter data.',
        error: e.message,
      });
    }

    try {
    } catch (e) {
      this.logger.error(e.message);
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Something went wrong! Failure to sort or filter data.',
        error: e.message,
      });
    }

    return new PaginationResultDto(MarketTradeDto, {
      ...paginationResult,
      items: paginationResult.items.map(MarketTradeDto.fromTrade),
    });
  }

  /**
   * Sort fields in ascending and descending order
   * @param {SelectQueryBuilder<IMarketTrade>} query - Selecting data from the MarketTrade table
   * @param {TradeSortingRequest} sort - Possible values: asc(Price), desc(Price), asc(TokenId), desc(TokenId) and more
   * @see TradesService.get
   * @private
   * @return ({SelectQueryBuilder<IMarketTrade>})
   */
  private applySort(query: SelectQueryBuilder<IMarketTrade>, sort: TradeSortingRequest): SelectQueryBuilder<IMarketTrade> {
    const params = [];

    if (JSON.stringify(sort.sort).includes('TradeDate') === false) sort.sort.push({ order: 1, column: 'TradeDate' });

    for (const param of sort.sort ?? []) {
      let column = this.sortingColumns.find((column) => equalsIgnoreCase(param.column, column));

      if (column === 'tokenid' || column === 'TokenId') {
        column = 'token_id';
      }
      if (column === 'creationdate' || column === 'CreationDate') {
        column = 'ask_created_at';
      }
      if (column === 'tradedate' || column === 'TradeDate') {
        column = 'buy_created_at';
      }
      if (column === 'collectionid' || column === 'CollectionId') {
        column = 'collection_id';
      }
      if (column === 'Price') {
        column = 'originPrice';
      }

      if (column === 'Status') {
        column = 'status';
      }

      if (column === null || column === undefined) continue;
      params.push({ ...param, column });
    }

    if (params.length <= 0) {
      return query;
    }

    let first = true;
    for (const param of params) {
      query = query[first ? 'orderBy' : 'addOrderBy'](`trade.${param.column}`, param.order === SortingOrder.Asc ? 'ASC' : 'DESC');
      first = false;
    }

    return query;
  }

  /**
   * Sorting by collections
   * @param {SelectQueryBuilder<IMarketTrade>} query - Selecting data from the MarketTrade table
   * @param {Array<number>} collectionIds -  collection ID (Array)
   * @private
   * @see TradesService.get
   * @return ({SelectQueryBuilder<IMarketTrade>})
   */
  private filterByCollectionIds(
    query: SelectQueryBuilder<IMarketTrade>,
    collectionIds: number[] | undefined,
  ): SelectQueryBuilder<IMarketTrade> {
    if (collectionIds == null || collectionIds.length <= 0) {
      return query;
    }

    return query.andWhere('trade.collection_id in (:...collectionIds)', { collectionIds });
  }

  /**
   * Sorting by Seller
   * @param {SelectQueryBuilder<IMarketTrade>} query - Selecting data from the MarketTrade table
   * @param {String } seller - Seller Hash
   * @private
   * @see TradesService.get
   * @return ({SelectQueryBuilder<IMarketTrade>})
   */
  private filterByAccountId(query: SelectQueryBuilder<IMarketTrade>, accountId: string | undefined): SelectQueryBuilder<IMarketTrade> {
    if (nullOrWhitespace(accountId)) {
      return query;
    }
    return query.andWhere('(trade.address_seller = :accountId OR trade.address_buyer = :accountId)', {
      accountId: accountId,
    });
  }
  public get isConnected(): boolean {
    return true;
  }

  private filterByTokenIds(query: SelectQueryBuilder<IMarketTrade>, tokenIds: number[] | undefined): SelectQueryBuilder<IMarketTrade> {
    if (tokenIds === null || tokenIds.length <= 0) {
      return query;
    }
    return query.andWhere('trade.token_id in (:...tokenIds)', { tokenIds });
  }

  private addRelations(queryBuilder: SelectQueryBuilder<IMarketTrade>): void {
    queryBuilder
      .leftJoinAndMapMany(
        'trade.search_index',
        SearchIndex,
        'search_index',
        'trade.network = search_index.network and trade.collection_id = search_index.collection_id and trade.token_id = search_index.token_id',
      )
      .leftJoinAndMapOne(
        'trade.offers',
        OffersEntity,
        'offers',
        'trade.block_number_ask = offers.block_number_ask and trade.block_number_buy = offers.block_number_buy and trade.token_id = offers.token_id and  trade.collection_id = offers.collection_id',
      )
      .leftJoinAndMapMany(
        'trade.search_filter',
        (subQuery) => {
          return subQuery
            .select([
              'collection_id',
              'network',
              'token_id',
              'is_trait',
              'locale',
              'key',
              'array_length(items, 1) as count_items',
              'items',
              'unnest(items) traits',
            ])
            .from(SearchIndex, 'sf')
            .where(`sf.type not in ('ImageURL')`);
        },
        'search_filter',
        'trade.network = search_filter.network and trade.collection_id = search_filter.collection_id and trade.token_id = search_filter.token_id',
      );
  }

  private filterBySearchText(query: SelectQueryBuilder<IMarketTrade>, text?: string): SelectQueryBuilder<IMarketTrade> {
    if (!nullOrWhitespace(text)) {
      query.andWhere(
        `search_filter.traits ILIKE CONCAT('%', cast(:searchText as text), '%') and search_filter.key not in ('description', 'collectionCover', 'image')`,
        { searchText: text },
      );
      if (Number(text + 0)) {
        query.orWhere(`trade.token_id = :tokenId`, { tokenId: Number(text) });
      }
    }
    return query;
  }

  private filterByTraits(
    query: SelectQueryBuilder<IMarketTrade>,
    traits?: string[],
    collectionId?: number[],
  ): SelectQueryBuilder<IMarketTrade> {
    if ((traits ?? []).length <= 0) {
      return query;
    } else {
      if ((collectionId ?? []).length <= 0) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Not found collectionIds. Please set collectionIds to offer by filter',
        });
      } else {
        query.andWhere('array [:...traits] <@ search_filter.items', { traits });

        return query;
      }
    }
  }

  public async getByAuction(auctionId: string): Promise<any> {
    if (!uuidValidateV4(auctionId)) {
      throw new BadRequestException('Invalid format auctionId. Please set auctionId UUID format');
    }
    const auction = await this.connection.manager
      .createQueryBuilder(OffersEntity, 'auction')
      .leftJoinAndMapMany('auction.bids', AuctionBidEntity, 'bids', 'bids.auction_id = auction.id')
      .where(`auction.id = :auctionId`, { auctionId });

    return auction.getMany();
  }

  private filterByStatus(query: SelectQueryBuilder<IMarketTrade>, method: SellingMethod | undefined): SelectQueryBuilder<IMarketTrade> {
    if (nullOrWhitespace(method)) {
      return query;
    }
    return query.andWhere('trade."method" = :method', {
      method,
    });
  }
}
