import { Injectable, Inject, BadRequestException, HttpStatus, forwardRef } from '@nestjs/common';
import { ApiPromise } from '@polkadot/api';
import { Connection, Repository, In } from 'typeorm';

import { MarketConfig } from '../config/market-config';
import { BulkSellNotBlockchainInputDto } from './dto/bulk.sell.not.blockchain.input.dto';
import { IsOkOutputDto } from './dto/is.ok.output.dto';
import * as util from '../utils/blockchain/util';
import { ContractAsk } from '../entity';
import { ASK_STATUS } from '../escrow/constants';
import { CurrencyPayName } from '../types';
import { SearchIndexService } from '../auction/services/search-index.service';
import { convertPriceToMoney } from '../utils';
import { UNIQUE_API_PROVIDER } from '../blockchain';

@Injectable()
export class BulkService {
  private contractAskRepository: Repository<ContractAsk>;

  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    @Inject(forwardRef(() => UNIQUE_API_PROVIDER)) private uniqueApi: ApiPromise,
    @Inject('DATABASE_CONNECTION') private connection: Connection,
    private readonly searchIndex: SearchIndexService,
  ) {
    this.contractAskRepository = connection.getRepository(ContractAsk);
  }

  async bulkSellNotBlockchain(input: BulkSellNotBlockchainInputDto): Promise<IsOkOutputDto> {
    if (!this.config.blockchain.unique.collectionIds.includes(input.collectionId)) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The collectionId is not in the collectionIds',
        error: 'The collectionId is not in the collectionIds',
      });
    }

    const accountTokens = await getTokensOwnedAccount(input.collectionId, this.config.mainSaleSeed, this.uniqueApi);

    const tokenIdsAcount = input.tokenIds?.length
      ? input.tokenIds.filter((tokenId) => accountTokens.includes(tokenId.toString())).map((token) => token.toString())
      : accountTokens;

    const tokenIds = tokenIdsAcount.length ? tokenIdsAcount : accountTokens;

    return accountTokens.length
      ? this.bulkSellSetNotBlockchain(input.collectionId, tokenIds, convertPriceToMoney(input.price), input.currency)
      : { isOk: true };
  }

  async bulkSellSetNotBlockchain(collectionId: number, accountTokens: string[], price: number, currency: CurrencyPayName): Promise<IsOkOutputDto> {
    const activeAsks = await this.contractAskRepository.find({
      where: {
        collection_id: collectionId,
        status: ASK_STATUS.CANCELLED,
        token_id: In(accountTokens),
      },
    });

    const addressFrom = await util.seedToAddress(this.config.mainSaleSeed);

    const items = accountTokens.map((token) => {
      const currentAsk = activeAsks.find((ask) => ask.token_id === token);
      const item = {
        status: ASK_STATUS.ACTIVE,
        collection_id: collectionId.toString(),
        token_id: token,
        network: this.config.blockchain.unique.network,
        price: price.toString(),
        currency,
        address_from: addressFrom,
        is_sell_blockchain: false,
      };
      return currentAsk ? { id: currentAsk.id, ...item } : item;
    });

    if (!items.length) {
      return {
        isOk: true,
      };
    }

    await this.contractAskRepository.save(items);

    for (const item of items) {
      await this.searchIndex.addSearchIndexIfNotExists({ collectionId, tokenId: parseInt(item.token_id) });
    }

    return {
      isOk: true,
    };
  }

  async removeFromSale(): Promise<IsOkOutputDto> {
    await this.contractAskRepository.update(
      {
        status: ASK_STATUS.ACTIVE,
      },
      {
        status: ASK_STATUS.CANCELLED,
      },
    );
    return {
      isOk: true,
    };
  }
}

export const getTokensOwnedAccount = async (collectionId: number, seed: string, uniqueApi: ApiPromise): Promise<string[]> => {
  const seedOwner = util.privateKey(seed);
  // TODO: Come up with types for such such cases
  const rcp = uniqueApi.rpc as any;
  const accountTokens: string[] = (await rcp.unique.accountTokens(collectionId, util.normalizeAccountId(seedOwner.address))).toHuman();
  return accountTokens;
};
