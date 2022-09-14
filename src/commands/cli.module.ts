import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigServiceModule } from '@app/config/module';
import { SentryLoggerService } from '@app/utils/sentry/sentry-logger.service';

import { EscrowModule } from '@app/escrow/module';
import { CollectionCommandService } from '@app/commands/services/collection.service';
import { CheckConfigCommandService } from '@app/commands/services/check-config.service';
import { CliCommands } from '@app/commands/cli.command';
import { DeployContractService } from '@app/commands/services/deploy-contract.service';
import { UniqueSdkModule } from '@app/uniquesdk/sdk.module';
import { DatabaseORMModule } from '@app/database/database.module';
import { StartMarketService } from './services/start-market.service';
import { HelperService } from '@app/helpers/helper.service';
import { Web3Service } from '@app/uniquesdk/web3.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'blockchain'),
    }),
    UniqueSdkModule,
    SentryLoggerService(),
    DatabaseORMModule,
    ConfigServiceModule,
    CommandModule,
    EscrowModule,
  ],
  controllers: [],
  providers: [
    CliCommands,
    CollectionCommandService,
    CheckConfigCommandService,
    DeployContractService,
    StartMarketService,
    HelperService,
    Web3Service,
  ],
})
export class CLIModule {}
