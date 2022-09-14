import { UniqueSdkModule } from '@app/uniquesdk/sdk.module';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { ConfigServiceModule } from '@app/config/module';

import { SearchIndexController } from './search-index.controller';
import { AuctionCreationService } from './services/auction-creation.service';
import { AuctionCancelingService } from './services/auction-canceling.service';
import { BidPlacingService } from './services/bid-placing.service';
import { BidWithdrawService } from './services/bid-withdraw.service';
import { AuctionController } from './auction.controller';
import { AuctionForceCloseController } from './auction-force-close.controller';
import { auctionCredentialsProvider } from './providers';
import { SignatureVerifier } from './services/helpers/signature-verifier';
import { AuctionClosingScheduler } from './services/closing/auction-closing.scheduler';
import { AuctionClosingService } from './services/closing/auction-closing.service';
import { ForceClosingService } from './services/closing/force-closing.service';
import { SearchIndexService } from './services/search-index.service';
import { HelperService } from '@app/helpers/helper.service';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { DatabaseORMModule } from '@app/database/database.module';

const isAuctionTestingStage = process.env.IS_AUCTION_TESTING_STAGE === 'true' || process.env.NODE_ENV === 'test';

@Module({
  imports: [ConfigServiceModule, ScheduleModule.forRoot(), UniqueSdkModule, DatabaseORMModule],
  providers: [
    auctionCredentialsProvider,
    SignatureVerifier,
    AuctionCreationService,
    AuctionCancelingService,
    BidPlacingService,
    BidWithdrawService,
    AuctionClosingService,
    AuctionClosingScheduler,
    ForceClosingService,
    SearchIndexService,
    HelperService,
    Web3Service,
  ],
  controllers: [AuctionController, SearchIndexController, ...(isAuctionTestingStage ? [AuctionForceCloseController] : [])],
  exports: [AuctionClosingScheduler, SearchIndexService, AuctionCreationService, SignatureVerifier],
})
export class AuctionModule {}
