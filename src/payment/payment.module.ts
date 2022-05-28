import { Module } from '@nestjs/common';
import { CheckoutModule } from './checkout/checkout.module';

@Module({
  imports: [CheckoutModule],
})
export class PaymentModule {}
