import { BadRequestException, HttpStatus, Injectable, Logger, Inject } from '@nestjs/common';
import { Checkout } from 'checkout-sdk-node';
import { Repository, DataSource } from 'typeorm';
import { SignatureType, Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { v4 as uuid } from 'uuid';
import { Sdk } from '@unique-nft/substrate-client';

import { SdkTransferService } from '@app/uniquesdk';
import { MarketConfig } from '@app/config/market-config';
import { OffersEntity } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';
import { SellingMethod } from '@app/types';
import { SearchIndexService } from '@app/auction/services/search-index.service';
import { InjectUniqueSDK } from '@app/uniquesdk';

import { PayOfferDto, PayOfferResponseDto, CreateFiatInput, OfferFiatDto, CancelFiatInput } from './dto';

type PaymentsResult = {
  id: string;
  amount: number;
  currency: string;
  approved: boolean;
  status: string;
  auth_code: string;
  response_code: string;
  response_summary: string;
  requiresRedirect: boolean;
};

@Injectable()
export class PayOffersService {
  private mainAccount: Account<KeyringPair>;

  private logger: Logger;
  private readonly offersRepository: Repository<OffersEntity>;
  private readonly cko = new Checkout(this.config.payment.checkout.secretKey);
  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    private readonly sdkTransferService: SdkTransferService,
    private searchIndexService: SearchIndexService,
    @InjectUniqueSDK() private readonly unique: Sdk,
  ) {
    this.logger = new Logger(PayOffersService.name);
    this.offersRepository = this.connection.getRepository(OffersEntity);
    this.mainAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.mainSaleSeed);
  }

  async payOffer(input: PayOfferDto): Promise<PayOfferResponseDto> {
    const offer = await this.offersRepository.findOne({
      where: {
        collection_id: input.collectionId,
        token_id: input.tokenId,
        address_from: this.mainAccount.instance.address,
        status: ASK_STATUS.ACTIVE,
      },
    });

    if (!offer) {
      throw new BadRequestException({
        statusCode: HttpStatus.I_AM_A_TEAPOT,
        message: 'Offer not found',
        error: 'Offer not found',
      });
    }

    const payment = (await this.cko.payments
      .request({
        source: {
          token: input.tokenCard,
        },
        currency: offer.currency,
        amount: parseInt(offer.price),
        reference: offer.id,
        // name plus email are unique
        customer: {
          name: input.buyerAddress,
          email: `${input.buyerAddress}@unique.network`,
        },
        metadata: {
          transferAddress: input.buyerAddress,
          collectionId: input.collectionId,
          tokenId: input.tokenId,
        },
      })
      .catch((err) => {
        this.logger.error(err);
        throw new BadRequestException({
          statusCode: err.http_code,
          message: 'Offer purchase error',
          error: err.message,
          errorBody: err.body,
        });
      })) as PaymentsResult;

    if (!payment.approved) {
      throw new BadRequestException({
        statusCode: payment.response_code,
        message: 'Offer purchase not approved',
        error: 'Offer purchase error',
        errorBody: {
          amount: payment.amount,
          currency: payment.currency,
          approved: payment.approved,
          status: payment.status,
          auth_code: payment.auth_code,
          response_code: payment.response_code,
          response_summary: payment.response_summary,
          requiresRedirect: payment.requiresRedirect,
        },
      });
    }

    const { isError } = await this.sdkTransferService.transferToken(
      this.mainAccount,
      input.buyerAddress,
      parseInt(offer.collection_id),
      parseInt(offer.token_id),
    );

    if (isError) {
      await this.cko.payments
        .refund(payment.id, {
          amount: parseInt(offer.price) / 100,
          reference: offer.id,
        })
        .catch((err) => {
          this.logger.error(err);
        });
      throw new BadRequestException({
        statusCode: HttpStatus.I_AM_A_TEAPOT,
        message: 'Offer transfer error',
        error: 'Offer transfer error',
      });
    }

    await this.offersRepository.update(
      {
        id: offer.id,
      },
      {
        status: ASK_STATUS.BOUGHT,
        address_to: input.buyerAddress,
      },
    );

    this.logger.log(
      `{subject:'Got buyKSM fiat', thread:'offer update', collection: ${offer.collection_id.toString()}, token: ${offer.token_id.toString()},
      )}', status: ${ASK_STATUS.BOUGHT}, log:'buyKSMfiat' }`,
    );

    return {
      isOk: true,
    };
  }

  async createFiat(createFiatInput: CreateFiatInput): Promise<OfferFiatDto> {
    try {
      const { tokens: accountTokens } = await this.unique.tokens.getAccountTokens({
        collectionId: createFiatInput.collectionId,
        address: this.mainAccount.instance.address,
      });

      const token = accountTokens.find((t) => t.tokenId === createFiatInput.tokenId);

      if (!token) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'You are not the owner of the token',
          error: 'You are not the owner of the token',
        });
      }

      const newOffer = this.offersRepository.create({
        id: uuid(),
        type: SellingMethod.Fiat,
        status: ASK_STATUS.ACTIVE,
        collection_id: token.collectionId.toString(),
        token_id: token.tokenId.toString(),
        network: this.config.blockchain.unique.network,
        price: (createFiatInput.price * 100).toString(),
        currency: createFiatInput.currency,
        address_from: this.mainAccount.instance.address,
      });

      const savedOffer = await this.offersRepository.save(newOffer);

      await this.searchIndexService.addSearchIndexIfNotExists({
        collectionId: Number(savedOffer.collection_id),
        tokenId: Number(savedOffer.token_id),
      });

      return {
        id: savedOffer.id,
        collectionId: parseInt(savedOffer.collection_id),
        tokenId: parseInt(savedOffer.token_id),
        price: savedOffer.price,
        seller: savedOffer.address_to,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async cancelFiat(cancelFiatInput: CancelFiatInput): Promise<OfferFiatDto> {
    const offer = await this.offersRepository.findOne({
      where: {
        collection_id: cancelFiatInput.collectionId.toString(),
        token_id: cancelFiatInput.tokenId.toString(),
        address_from: this.mainAccount.instance.address,
        status: ASK_STATUS.ACTIVE,
      },
    });
    if (!offer) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Active offer not found',
        error: 'Active offer not found',
      });
    }

    const updatedOffer = await this.offersRepository.save({
      ...offer,
      status: ASK_STATUS.CANCELLED,
    });

    return {
      id: updatedOffer.id,
      collectionId: parseInt(updatedOffer.collection_id),
      tokenId: parseInt(updatedOffer.token_id),
      price: updatedOffer.price,
      seller: updatedOffer.address_from,
    };
  }
}
