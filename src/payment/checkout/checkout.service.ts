import { Injectable, Inject, Logger, BadRequestException, HttpStatus, forwardRef } from '@nestjs/common';
import { Checkout } from 'checkout-sdk-node';
import { ApiPromise } from '@polkadot/api';
import { Connection, Repository } from 'typeorm';

import { MarketConfig } from '../../config/market-config';
import { PayCheckoutInputDto } from './pay.checkout.input.dto';
import { OffersService } from '../../offers';
import { convertMoneyToPrice } from '../../utils';
import { ContractAsk } from '../../entity';
import { ASK_STATUS } from '../../escrow/constants';
import { privateKey } from '../../utils/blockchain/util';
import { convertAddress, normalizeAccountId } from '../../utils/blockchain/util';
import { signTransaction, TransactionStatus } from '../../utils/blockchain/signTransaction';
import { UNIQUE_API_PROVIDER } from '../../blockchain';

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
export class CheckoutService {
  private logger: Logger;
  private readonly cko = new Checkout(this.config.payment.checkout.secretKey);
  private contractAskRepository: Repository<ContractAsk>;
  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    private offersService: OffersService,
    @Inject(forwardRef(() => UNIQUE_API_PROVIDER)) private uniqueApi: ApiPromise,
    @Inject('DATABASE_CONNECTION') private connection: Connection,
  ) {
    this.logger = new Logger(CheckoutService.name);
    this.contractAskRepository = connection.getRepository(ContractAsk);
  }

  async pay(input: PayCheckoutInputDto) {
    const offer = await this.offersService.getOne({ collectionId: input.collectionId, tokenId: input.tokenId });
    if (!offer) {
      throw new BadRequestException({
        statusCode: HttpStatus.I_AM_A_TEAPOT,
        message: 'Offer not found',
        error: 'Offer not found',
      });
    }

    // 1 = 0.01
    const CHECKOUT_FACTOR = 100;
    const payment = (await this.cko.payments
      .request({
        source: {
          token: input.tokenCard,
        },
        currency: this.config.payment.currentCurrency,
        amount: convertMoneyToPrice(parseInt(offer.price)) * CHECKOUT_FACTOR,
        reference: offer.id.toString(),
        // name plus email are unique
        customer: {
          name: input.transferAddress,
          email: `${input.transferAddress}@unique.network`,
        },
        metadata: {
          transferAddress: input.transferAddress,
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
        message: 'Offer purchase error',
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

    const addressMain = privateKey(this.config.mainSaleSeed);
    const address = await convertAddress(input.transferAddress);

    const transaction = this.uniqueApi.tx.unique.transfer(normalizeAccountId(address), input.collectionId, input.tokenId, 1);

    const { status } = await signTransaction(addressMain, transaction, 'transaction');

    if (status === TransactionStatus.FAIL) {
      await this.cko.payments
        .refund(payment.id, {
          amount: payment.amount,
          reference: offer.id.toString(),
        })
        .catch((err) => {
          this.logger.error(err);
        });
      throw new BadRequestException({
        statusCode: HttpStatus.I_AM_A_TEAPOT,
        message: 'Offer purchase error',
        error: 'Offer purchase error',
      });
    }

    await this.buyKSM(input.collectionId, input.tokenId, address);

    return {
      isOk: true,
    };
  }

  async buyKSM(collectionId: number, tokenId: number, toAddress: string) {
    await this.contractAskRepository.update(
      {
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        status: ASK_STATUS.ACTIVE,
      },
      { status: ASK_STATUS.BOUGHT, address_to: toAddress },
    );

    this.logger.log(
      `{subject:'Got buyKSM', thread:'offer update', collection: ${collectionId.toString()}, token: ${tokenId.toString()},
      )}', status: 'ACTIVE', log:'buyKSM' }`,
    );
  }
}
