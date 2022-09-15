import { Module } from '@nestjs/common';

import { ConfigServiceModule } from '@app/config/module';
import { AuctionModule } from '@app/auction/auction.module';

import { OffersFilterService } from './offers-filter.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PayOffersService } from './pay.service';

@Module({
  imports: [ConfigServiceModule, AuctionModule],
  controllers: [OffersController],
  providers: [OffersService, OffersFilterService, PayOffersService],
  exports: [OffersService],
})
export class OffersModule {}
