import { Controller, Post, Body, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs';

import { PayCheckoutInputDto } from './pay.checkout.input.dto';
import { PayCheckoutOutputDto } from './pay.checkout.output.dto';
import { CheckoutService } from './checkout.service';

@ApiTags('Payment')
@Controller('payment/checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}
  @ApiOperation({
    summary: 'To pay out to from card',
    description: fs.readFileSync('docs/payment/checkout-pay.md').toString(),
  })
  @ApiResponse({ type: PayCheckoutOutputDto, status: HttpStatus.CREATED })
  @Post('pay')
  async pay(@Body() input: PayCheckoutInputDto): Promise<PayCheckoutOutputDto> {
    return this.checkoutService.pay(input);
  }
}
