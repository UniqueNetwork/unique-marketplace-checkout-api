import { DatabaseORMModule } from '@app/database/database.module';
import { Module } from '@nestjs/common';
import { OffersFilterService } from './offers-filter.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [DatabaseORMModule],
  controllers: [OffersController],
  providers: [OffersService, OffersFilterService],
  exports: [OffersService],
})
export class OffersModule {}
