import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

import { ConfigModule } from '../../config/module';
import { OffersModule } from '../../offers/offers.module';

@Module({
  imports: [ConfigModule, OffersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
