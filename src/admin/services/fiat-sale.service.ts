import { Injectable, Inject, HttpStatus, BadRequestException } from '@nestjs/common';
import { SignatureType, Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { Repository, DataSource } from 'typeorm';
import { Sdk } from '@unique-nft/substrate-client';
import { KeyringPair } from '@polkadot/keyring/types';

import { MarketConfig } from '@app/config/market-config';
import { OffersEntity } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';
import { SellingMethod } from '@app/types';
import { InjectUniqueSDK } from '@app/uniquesdk';
import { PayOffersService } from '@app/offers/pay.service';
import { OfferFiatDto } from '@app/offers/dto/pay.dto';

import { MassFiatSaleDTO, MassFiatSaleResultDto, MassCancelFiatResult } from '../dto';

@Injectable()
export class FiatSaleService {
  private auctionAccount: Account<KeyringPair>;
  private bulkSaleAccount: Account<KeyringPair>;
  private readonly offersRepository: Repository<OffersEntity>;
  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    @InjectUniqueSDK() private readonly unique: Sdk,
    private connection: DataSource,
    private readonly payOffersService: PayOffersService,
  ) {
    this.auctionAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.auction.seed);
    this.bulkSaleAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.bulkSaleSeed);
    this.offersRepository = this.connection.getRepository(OffersEntity);
  }

  async massFiatSale(data: MassFiatSaleDTO): Promise<MassFiatSaleResultDto> {
    const { tokens: accountTokens } = await this.unique.tokens.getAccountTokens({
      collectionId: data.collectionId,
      address: this.bulkSaleAccount.instance.address,
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

    if (!tokenIdsAcount.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Not tokens to sale',
        tokenIds: [],
      };
    }

    const offersFiat: OfferFiatDto[] = [];

    for (const tokenId of tokenIdsAcount) {
      const unsignedTxPayload = await this.unique.tokens.transfer.build(
        {
          address: this.bulkSaleAccount.instance.address,
          to: this.auctionAccount.instance.address,
          collectionId: data.collectionId,
          tokenId: parseInt(tokenId),
        },
        { signer: this.bulkSaleAccount },
      );

      const { signature } = await this.bulkSaleAccount.sign(unsignedTxPayload);

      const offerFiat = await this.payOffersService.createFiat({
        price: data.price,
        currency: data.currency,
        signature,
        signerPayloadJSON: unsignedTxPayload.signerPayloadJSON,
      });
      offersFiat.push(offerFiat);
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Mass fiat listing completed',
      tokenIds: offersFiat.map((offer) => offer.tokenId),
    };
  }

  async massCancelFiat(): Promise<MassCancelFiatResult> {
    const currentOffers = await this.offersRepository.find({
      where: {
        status: ASK_STATUS.ACTIVE,
        type: SellingMethod.Fiat,
        address_from: this.bulkSaleAccount.instance.address,
        address_to: this.auctionAccount.instance.address,
      },
    });

    const canceledOfferFiat: OfferFiatDto[] = [];

    for (const offer of currentOffers) {
      const cancelOfferFiat = await this.payOffersService.cancelFiat({
        collectionId: offer.collection_id,
        tokenId: offer.token_id,
        sellerAddress: offer.address_from,
      });
      canceledOfferFiat.push(cancelOfferFiat);
    }

    return {
      statusCode: HttpStatus.OK,
      message: `${canceledOfferFiat.length} offers successfully canceled`,
    };
  }
}
