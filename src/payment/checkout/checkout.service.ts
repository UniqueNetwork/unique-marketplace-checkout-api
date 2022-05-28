import { Injectable, Inject, Logger, BadRequestException, HttpStatus } from '@nestjs/common';
import { Checkout } from 'checkout-sdk-node';

import { MarketConfig } from '../../config/market-config';
import { PayCheckoutInputDto } from './pay.checkout.input.dto';
import { OffersService } from '../../offers';

@Injectable()
export class CheckoutService {
  private logger: Logger;
  private readonly cko = new Checkout(this.config.payment.checkout.secretKey);
  constructor(@Inject('CONFIG') private config: MarketConfig, private offersService: OffersService) {
    this.logger = new Logger(CheckoutService.name);
  }

  async pay(input: PayCheckoutInputDto) {
    try {
      /*
      const payment = await this.cko.payments.request({
        source: {
          token: input.tokenCard,
        },
        currency: this.config.payment.currentCurrency,
        amount: 1,
        //reference: 'ORDER 111',
      });
      */
      //const offer = await this.offersService.getOne({ collectionId: 4, tokenId: input.tokenId });
      console.log(input, 'payment-------------');
    } catch (err) {
      this.logger.error(err.message);
      throw new BadRequestException({
        statusCode: HttpStatus.I_AM_A_TEAPOT,
        message: 'Offer purchase error',
        error: err.message,
      });
    }
  }
}
