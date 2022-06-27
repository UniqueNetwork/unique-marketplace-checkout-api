import { Module } from '@nestjs/common';

import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';
import { ConfigModule } from '../config/module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuctionModule } from '../auction/auction.module';

@Module({
  imports: [ConfigModule, BlockchainModule, AuctionModule],
  controllers: [BulkController],
  providers: [BulkService],
})
export class BulkModule {}
