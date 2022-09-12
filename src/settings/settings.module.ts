import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ConfigServiceModule } from '../config/module';
import { AllowedListService } from './allowedlist.service';
import { MarketService } from './market.service';
import { MassCancelingService } from '../admin/services';
import { HelperService } from '@app/helpers/helper.service';
import { Web3Service } from '@app/uniquesdk/web3.service';

@Module({
  imports: [ConfigServiceModule],
  controllers: [SettingsController],
  providers: [SettingsService, AllowedListService, MarketService, MassCancelingService, HelperService, Web3Service],
  exports: [SettingsService],
})
export class SettingsModule {}
