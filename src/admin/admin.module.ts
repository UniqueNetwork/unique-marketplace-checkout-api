import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService, CollectionsService, MassCancelingService, MassSaleService, TokenService } from './services';
import { ConfigServiceModule } from '@app/config/module';
import { MarketConfig } from '@app/config';
import { AuctionModule } from '@app/auction/auction.module';
import { DatabaseORMModule } from '@app/database/database.module';
import { HelperService } from '@app/helpers/helper.service';

@Module({
  imports: [
    ConfigServiceModule,
    JwtModule.registerAsync({
      imports: [ConfigServiceModule],
      useFactory: async (config: MarketConfig) => ({
        secret: config.blockchain.escrowSeed,
      }),
      inject: ['CONFIG'],
    }),
    DatabaseORMModule,
    AuctionModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, CollectionsService, MassSaleService, TokenService, MassCancelingService, HelperService],
  exports: [AdminService, MassSaleService, MassCancelingService, TokenService],
})
export class AdminModule {}
