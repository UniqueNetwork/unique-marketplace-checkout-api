import { Module } from '@nestjs/common';

import { BlockchainModule } from '../../blockchain/blockchain.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ConfigModule } from '../../config/module';
import { OffersModule } from '../../offers/offers.module';

@Module({
  imports: [ConfigModule, BlockchainModule, OffersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
