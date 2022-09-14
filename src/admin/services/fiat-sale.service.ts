import { Injectable, Inject, HttpStatus, BadRequestException } from '@nestjs/common';
import { SignatureType } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { Repository, DataSource, In } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { Sdk } from '@unique-nft/substrate-client';

import { MarketConfig } from '@app/config/market-config';
import { OffersEntity } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';
import { SellingMethod } from '@app/types';
import { SearchIndexService } from '@app/auction/services/search-index.service';
import { InjectUniqueSDK } from '@app/uniquesdk';

import { MassFiatSaleDTO, MassFiatSaleResultDto, MassCancelFiatResult } from '../dto';

@Injectable()
export class FiatSaleService {
  private readonly offersRepository: Repository<OffersEntity>;
  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    private readonly searchIndex: SearchIndexService,
    @InjectUniqueSDK() private readonly unique: Sdk,
  ) {
    this.offersRepository = this.connection.getRepository(OffersEntity);
  }

  async massFiatSale(data: MassFiatSaleDTO): Promise<MassFiatSaleResultDto> {
    const mainAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.mainSaleSeed);
    const { tokens: accountTokens } = await this.unique.tokens.getAccountTokens({
      collectionId: data.collectionId,
      address: mainAccount.instance.address,
    });
    if (accountTokens.length === 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The collectionId is not in the collections',
        error: 'The collectionId is not in the collections',
      });
    }
    const tokenIdsAcount = data.tokenIds?.length
      ? data.tokenIds.filter((tokenId) => accountTokens.map(({ tokenId }) => tokenId).includes(tokenId)).map((token) => token.toString())
      : accountTokens.map(({ tokenId }) => tokenId.toString());

    const tokenIds = tokenIdsAcount.length ? tokenIdsAcount : accountTokens.map(({ tokenId }) => tokenId.toString());

    const currentOffers = await this.offersRepository.find({
      where: {
        type: SellingMethod.Fiat,
        collection_id: data.collectionId.toString(),
        token_id: In(tokenIds),
        address_from: mainAccount.instance.address,
      },
    });

    const newOffers: OffersEntity[] = tokenIds
      .filter((tokenId) => !currentOffers.map(({ token_id }) => token_id).includes(tokenId))
      .map((tokenId) => {
        return this.offersRepository.create({
          id: uuid(),
          type: SellingMethod.Fiat,
          status: ASK_STATUS.ACTIVE,
          collection_id: data.collectionId.toString(),
          token_id: tokenId,
          network: this.config.blockchain.unique.network,
          price: (data.price * 100).toString(),
          currency: data.currency,
          address_from: mainAccount.instance.address,
        });
      });

    const canceledOffers = currentOffers.filter((offer) => offer.status === ASK_STATUS.CANCELLED);

    if (!newOffers.length && !canceledOffers.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Not tokens to sale',
        data: [],
      };
    }

    const saveOffers = await this.offersRepository.save([
      ...newOffers,
      ...canceledOffers.map((offer) => ({ ...offer, status: ASK_STATUS.ACTIVE })),
    ]);

    for (const item of saveOffers) {
      await this.searchIndex.addSearchIndexIfNotExists({ collectionId: data.collectionId, tokenId: parseInt(item.token_id) });
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Mass fiat listing completed',
      data: saveOffers.map(({ token_id }) => parseInt(token_id)),
    };
  }

  async massCancelFiat(): Promise<MassCancelFiatResult> {
    const mainAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.mainSaleSeed);
    const { affected } = await this.offersRepository.update(
      {
        type: SellingMethod.Fiat,
        status: ASK_STATUS.ACTIVE,
        address_from: mainAccount.instance.address,
      },
      {
        status: ASK_STATUS.CANCELLED,
      },
    );
    return {
      statusCode: HttpStatus.OK,
      message: `${affected} offers successfully canceled`,
    };
  }
}
