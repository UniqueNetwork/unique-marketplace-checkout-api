import { KeyringPair } from '@polkadot/keyring/types';
import { Provider } from '@nestjs/common';
import { MarketConfig } from '@app/config';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { KUSAMA_SDK_PROVIDER, UNIQUE_SDK_PROVIDER } from '@app/uniquesdk/constants/constants';
import { Sdk } from '@unique-nft/substrate-client';
import { HelperService } from '@app/helpers/helper.service';
import { SdkProvider } from '../../uniquesdk/sdk-provider';

export type AuctionCredentials = {
  keyring?: KeyringPair;
  uniqueAddress: string;
  kusamaAddress: string;
};

export const auctionCredentialsProvider: Provider = {
  provide: 'AUCTION_CREDENTIALS',
  inject: ['CONFIG', UNIQUE_SDK_PROVIDER, KUSAMA_SDK_PROVIDER],
  useFactory: async (config: MarketConfig, uniqueApi: SdkProvider, kusamaApi: SdkProvider) => {
    const auctionCredentials: AuctionCredentials = {
      uniqueAddress: '',
      kusamaAddress: '',
    };

    if (config.auction.seed) {
      await cryptoWaitReady();
      const keyring = new Keyring({ type: 'sr25519' }).addFromUri(config.auction.seed);
      const helper = new HelperService();
      const [uniqueAddress, kusamaAddress] = await Promise.all([
        helper.convertAddress(keyring.address, uniqueApi.sdk.api.registry.chainSS58),
        helper.convertAddress(keyring.address, kusamaApi.sdk.api.registry.chainSS58),
      ]);

      auctionCredentials.keyring = keyring;
      auctionCredentials.uniqueAddress = uniqueAddress;
      auctionCredentials.kusamaAddress = kusamaAddress;
    }

    return auctionCredentials;
  },
};
