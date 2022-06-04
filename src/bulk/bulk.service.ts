import { Injectable, Inject, BadRequestException, HttpStatus } from '@nestjs/common';
import { ApiPromise } from '@polkadot/api';
import { Connection, Repository } from 'typeorm';

import { MarketConfig } from '../config/market-config';
import { BulkSellNotBlockchainInputDto } from './bulk.sell.not.blockchain.input.dto';
import { BulkSellNotBlockchainOutputDto } from './bulk.sell.not.blockchain.output.dto';
import * as util from '../utils/blockchain/util';
import { ContractAsk } from '../entity';
import { ASK_STATUS } from '../escrow';
import { CurrencyPayName } from './types';
import { SearchIndexService } from '../auction/services/search-index.service';
import { convertPriceToMoney } from './utils';

@Injectable()
export class BulkService {
  private contractAskRepository: Repository<ContractAsk>;

  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    @Inject('UNIQUE_API') private uniqueApi: ApiPromise,
    @Inject('DATABASE_CONNECTION') private connection: Connection,
    private readonly searchIndex: SearchIndexService,
  ) {
    this.contractAskRepository = connection.getRepository(ContractAsk);
  }

  async bulkSellNotBlockchain(input: BulkSellNotBlockchainInputDto): Promise<BulkSellNotBlockchainOutputDto> {
    if (!this.config.blockchain.unique.collectionIds.includes(input.collectionId)) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The collectionId is not in the collectionIds',
        error: 'The collectionId is not in the collectionIds',
      });
    }

    const mainSeed = util.privateKey(this.config.mainSaleSeed);
    // TODO: Come up with types for such such cases
    const rcp = this.uniqueApi.rpc as any;
    const accountTokens: string[] = (await rcp.unique.accountTokens(input.collectionId, util.normalizeAccountId(mainSeed.address))).toHuman();

    console.log(input.tokenIds?.length, '---');

    const tokenIdsAcount = input.tokenIds?.length
      ? input.tokenIds.filter((tokenId) => accountTokens.includes(tokenId.toString())).map((token) => token.toString())
      : accountTokens;

    const tokenIds = tokenIdsAcount.length ? tokenIdsAcount : accountTokens;

    return accountTokens.length
      ? this.bulkSellSetNotBlockchain(input.collectionId, tokenIds, convertPriceToMoney(input.price), input.currency)
      : { isOk: true };
  }

  async bulkSellSetNotBlockchain(
    collectionId: number,
    accountTokens: string[],
    price: number,
    currency: CurrencyPayName,
  ): Promise<BulkSellNotBlockchainOutputDto> {
    const currentAsks = await this.contractAskRepository.find({
      where: {
        collection_id: collectionId,
      },
    });

    const newTokensSell = accountTokens.filter((token) => !currentAsks.map((ask) => ask.token_id).includes(token));
    if (!newTokensSell.length) {
      return {
        isOk: true,
      };
    }

    const addressFrom = await util.seedToAddress(this.config.mainSaleSeed);

    await this.contractAskRepository
      .createQueryBuilder()
      .insert()
      .values(
        newTokensSell.map((token) => ({
          status: ASK_STATUS.ACTIVE,
          collection_id: collectionId.toString(),
          token_id: token,
          network: this.config.blockchain.unique.network,
          price: price.toString(),
          currency,
          address_from: addressFrom,
          is_sell_blockchain: false,
        })),
      )
      .execute();

    for (const tokenId of newTokensSell) {
      await this.searchIndex.addSearchIndexIfNotExists({ collectionId, tokenId: parseInt(tokenId) });
    }

    return {
      isOk: true,
    };
  }
}
