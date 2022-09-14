import { DatabaseORMModule } from '@app/database/database.module';
import { Module } from '@nestjs/common';

import { ConfigServiceModule } from '@app/config/module';

import { OffersFilterService } from './offers-filter.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PayOffersService } from './pay.service';

@Module({
  imports: [DatabaseORMModule, ConfigServiceModule],
  controllers: [OffersController],
  providers: [OffersService, OffersFilterService, PayOffersService],
  exports: [OffersService],
})
export class OffersModule {}
