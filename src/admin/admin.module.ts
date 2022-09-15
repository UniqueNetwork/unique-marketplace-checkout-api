import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService, CollectionsService, MassCancelingService, MassSaleService, TokenService, FiatSaleService } from './services';
import { ConfigServiceModule } from '@app/config/module';
import { MarketConfig } from '@app/config/market-config';
import { AuctionModule } from '@app/auction/auction.module';
import { DatabaseORMModule } from '@app/database/database.module';

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

    AuctionModule,
    DatabaseORMModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, CollectionsService, MassSaleService, TokenService, MassCancelingService, FiatSaleService],
  exports: [AdminService, MassSaleService, MassCancelingService, TokenService, JwtModule],
})
export class AdminModule {}
