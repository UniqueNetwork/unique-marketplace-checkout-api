import { BadRequestException, HttpStatus, Injectable, Logger, Inject } from '@nestjs/common';
import { Checkout } from 'checkout-sdk-node';
import { Repository, DataSource, In } from 'typeorm';
import { SignatureType } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';

import { InjectUniqueSDK, SdkProvider } from '@app/uniquesdk';
import { MarketConfig } from '@app/config';
import { OffersEntity } from '@app/entity';
import { ASK_STATUS } from '@app/escrow/constants';

import { PayOfferDto, PayOfferResponseDto } from './dto';

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
  private logger: Logger;
  private readonly offersRepository: Repository<OffersEntity>;
  private readonly cko = new Checkout(this.config.payment.checkout.secretKey);
  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    @InjectUniqueSDK() private readonly uniqueProvider: SdkProvider,
  ) {
    this.logger = new Logger(PayOffersService.name);
    this.offersRepository = connection.getRepository(OffersEntity);
  }

  async payOffer(input: PayOfferDto): Promise<PayOfferResponseDto> {
    const mainAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.mainSaleSeed);

    const offer = await this.offersRepository.findOne({
      where: {
        collection_id: input.collectionId,
        token_id: input.tokenId,
        address_from: mainAccount.instance.address,
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

    const { isError } = await this.uniqueProvider.transferService.transferToken(
      mainAccount,
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
}
