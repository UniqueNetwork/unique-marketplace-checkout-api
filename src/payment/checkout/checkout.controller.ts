import { Controller, Post, Body, Inject, BadRequestException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';

import { PayCheckoutInputDto } from './pay.checkout.input.dto';
import { CheckoutService } from './checkout.service';
import { OffersService } from '../../offers';
import { MarketConfig } from '../../config/market-config';

@ApiTags('Payment')
@Controller('payment/checkout')
export class CheckoutController {
  constructor(@Inject('CONFIG') private config: MarketConfig, private readonly checkoutService: CheckoutService, private offersService: OffersService) {}

  @ApiOperation({
    summary: 'To pay out to from card',
    description: fs.readFileSync('docs/payment/checkout-pay.md').toString(),
  })
  @Post('pay')
  async pay(@Body() input: PayCheckoutInputDto) {
    const collectionId = this.config.blockchain.unique.collectionIds[0];
    const offer = await this.offersService.getOne({ collectionId, tokenId: input.tokenId });
    if (!offer) {
      throw new BadRequestException({
        statusCode: HttpStatus.I_AM_A_TEAPOT,
        message: 'Offer not found',
        error: 'Offer not found',
      });
    }

    //const r = await this.checkoutService.pay(input);
    console.log(offer, '---');
    return 'checkout';
  }
}
