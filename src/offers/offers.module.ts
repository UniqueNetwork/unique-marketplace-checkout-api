import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';

@Module({
  imports: [OffersService],
  exports: [OffersService],
  providers: [OffersService],
})
export class OffersModule {}
