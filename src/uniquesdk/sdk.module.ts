import { SdkTokensService } from './sdk-tokens.service';
import { Global, Logger, Module, Provider, Scope, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigServiceModule } from '@app/config/module';

import { MarketConfig } from '@app/config/market-config';
import { Sdk } from '@unique-nft/substrate-client';
import { KUSAMA_SDK_PROVIDER, UNIQUE_SDK_PROVIDER } from '@app/uniquesdk/constants/constants';
import '@unique-nft/substrate-client/state-queries';
import '@unique-nft/substrate-client/tokens';
import '@unique-nft/substrate-client/balance';
import '@unique-nft/substrate-client/extrinsics';
import { SdkStateService } from '@app/uniquesdk/sdk-state.service';
import { SdkExtrinsicService } from '@app/uniquesdk/sdk-extrinsic.service';
import { SdkTransferService } from '@app/uniquesdk/sdk-transfer.service';
import { SdkCollectionService } from './sdk-collections.service';
import { SdkTestService } from '@app/uniquesdk/sdk.service';

const waitConnectionReady = async (sdk: Sdk, logger: Logger, wsEndpoint: string): Promise<Sdk> => {
  sdk.api.on('ready', () => logger.debug(`ready (${wsEndpoint})`));
  sdk.api.on('connected', () => logger.debug(`connected (${wsEndpoint})`));
  sdk.api.on('disconnected', () => logger.warn(`disconnected (${wsEndpoint})`));
  sdk.api.on('error', () => logger.error(`error (${wsEndpoint})`));

  const [chain, version] = await Promise.all([sdk.api.rpc.system.chain(), sdk.api.rpc.system.version()]);
  sdk.api.isReady;
  logger.log(`${chain} (${wsEndpoint}) version ${version} - ready`);

  return sdk;
};

export const UniqueSDKProvider: Provider<Promise<Sdk>> = {
  provide: UNIQUE_SDK_PROVIDER,
  inject: ['CONFIG'],
  useFactory: async (config: MarketConfig) => {
    const logger = new Logger(UNIQUE_SDK_PROVIDER);
    const { wsEndpoint } = config.blockchain.unique;
    const sdk = await Sdk.create({ chainWsUrl: wsEndpoint });
    return await waitConnectionReady(sdk, logger, wsEndpoint);
  },
  scope: Scope.DEFAULT,
};

export const KusamaSDKProvider: Provider<Promise<Sdk>> = {
  provide: KUSAMA_SDK_PROVIDER,
  inject: ['CONFIG'],
  useFactory: async (config: MarketConfig) => {
    const logger = new Logger(KUSAMA_SDK_PROVIDER);
    const { wsEndpoint } = config.blockchain.kusama;
    const sdk = await Sdk.create({ chainWsUrl: wsEndpoint });
    return await waitConnectionReady(sdk, logger, wsEndpoint);
  },
  scope: Scope.DEFAULT,
};
@Global()
@Module({
  imports: [ConfigServiceModule],
  providers: [
    UniqueSDKProvider,
    KusamaSDKProvider,
    SdkStateService,
    SdkTokensService,
    SdkExtrinsicService,
    SdkTransferService,
    SdkCollectionService,
    SdkTestService,
  ],
  exports: [
    UniqueSDKProvider,
    KusamaSDKProvider,
    SdkStateService,
    SdkTokensService,
    SdkExtrinsicService,
    SdkTransferService,
    SdkCollectionService,
  ],
})
export class UniqueSdkModule implements OnApplicationShutdown {
  constructor(@Inject(UNIQUE_SDK_PROVIDER) private readonly unique: Sdk, @Inject(KUSAMA_SDK_PROVIDER) private readonly kusama: Sdk) {}
  onApplicationShutdown() {
    this.unique.api.disconnect();
    this.kusama.api.disconnect();
  }
}
