import { Global, Inject, Logger, Module, OnApplicationShutdown, Provider, Scope } from '@nestjs/common';
import { ConfigServiceModule } from '@app/config/module';

import { MarketConfig } from '@app/config';
import { Sdk } from '@unique-nft/substrate-client';
import { KUSAMA_SDK_PROVIDER, UNIQUE_SDK_PROVIDER, WEB3_PROVIDER } from '@app/uniquesdk/constants/constants';
import '@unique-nft/substrate-client/state-queries';
import '@unique-nft/substrate-client/tokens';
import '@unique-nft/substrate-client/balance';
import '@unique-nft/substrate-client/extrinsics';
import Web3 from 'web3';

import { Web3Connect } from '@app/uniquesdk/sdk.types';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { HelperService } from '@app/helpers/helper.service';
import { SdkProvider } from './sdk-provider';

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

export const UniqueSDKProvider: Provider<Promise<SdkProvider>> = {
  provide: UNIQUE_SDK_PROVIDER,
  inject: ['CONFIG'],
  useFactory: async (config: MarketConfig) => {
    const logger = new Logger(UNIQUE_SDK_PROVIDER);
    const { wsEndpoint } = config.blockchain.unique;
    const sdk = await Sdk.create({ chainWsUrl: wsEndpoint });
    await waitConnectionReady(sdk, logger, wsEndpoint);
    return new SdkProvider(sdk);
  },
  scope: Scope.DEFAULT,
};

export const KusamaSDKProvider: Provider<Promise<SdkProvider>> = {
  provide: KUSAMA_SDK_PROVIDER,
  inject: ['CONFIG'],
  useFactory: async (config: MarketConfig) => {
    const logger = new Logger(KUSAMA_SDK_PROVIDER);
    const { wsEndpoint } = config.blockchain.kusama;
    const sdk = await Sdk.create({ chainWsUrl: wsEndpoint });
    await waitConnectionReady(sdk, logger, wsEndpoint);
    return new SdkProvider(sdk);
  },
  scope: Scope.DEFAULT,
};

export const WEB3Provider: Provider<Promise<Web3Connect>> = {
  provide: WEB3_PROVIDER,
  inject: ['CONFIG'],
  useFactory: async (config: MarketConfig) => {
    const logger = new Logger(WEB3_PROVIDER, { timestamp: true });
    const { wsEndpoint } = config.blockchain.unique;
    const provider = new Web3.providers.WebsocketProvider(wsEndpoint, {
      reconnect: { auto: true, maxAttempts: 5, delay: 1000 },
    });
    const web3 = new Web3(provider);
    logger.log(`${web3.version} RPC: ${web3.currentProvider['url']} - connection ready`);
    return { web3, provider };
  },
  scope: Scope.DEFAULT,
};

@Global()
@Module({
  imports: [ConfigServiceModule],
  providers: [UniqueSDKProvider, KusamaSDKProvider, WEB3Provider, Web3Service, HelperService],
  exports: [UniqueSDKProvider, KusamaSDKProvider, WEB3Provider, Web3Service],
})
export class UniqueSdkModule implements OnApplicationShutdown {
  constructor(
    @Inject(UNIQUE_SDK_PROVIDER) private readonly unique: SdkProvider,
    @Inject(KUSAMA_SDK_PROVIDER) private readonly kusama: SdkProvider,
    @Inject(WEB3_PROVIDER) private readonly web3conn: Web3Connect,
  ) {}
  onApplicationShutdown() {
    this.unique.sdk.api.disconnect();
    this.kusama.sdk.api.disconnect();
    this.web3conn.provider.disconnect();
  }
}
