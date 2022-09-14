import { KeyringPair } from '@polkadot/keyring/types';
import { Provider } from '@nestjs/common';
import { MarketConfig } from '../../config/market-config';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { convertAddress } from '../../utils/blockchain/util';
import { KUSAMA_SDK_PROVIDER, UNIQUE_SDK_PROVIDER } from '@app/uniquesdk/constants/constants';
import { Sdk } from '@unique-nft/substrate-client';

export type AuctionCredentials = {
  keyring?: KeyringPair;
  uniqueAddress: string;
  kusamaAddress: string;
};

export const auctionCredentialsProvider: Provider = {
  provide: 'AUCTION_CREDENTIALS',
  inject: ['CONFIG', UNIQUE_SDK_PROVIDER, KUSAMA_SDK_PROVIDER],
  useFactory: async (config: MarketConfig, uniqueApi: Sdk, kusamaApi: Sdk) => {
    const auctionCredentials: AuctionCredentials = {
      uniqueAddress: '',
      kusamaAddress: '',
    };

    if (config.auction.seed) {
      await cryptoWaitReady();
      const keyring = new Keyring({ type: 'sr25519' }).addFromUri(config.auction.seed);

      const [uniqueAddress, kusamaAddress] = await Promise.all([
        convertAddress(keyring.address, uniqueApi.api.registry.chainSS58),
        convertAddress(keyring.address, kusamaApi.api.registry.chainSS58),
      ]);

      auctionCredentials.keyring = keyring;
      auctionCredentials.uniqueAddress = uniqueAddress;
      auctionCredentials.kusamaAddress = kusamaAddress;
    }

    return auctionCredentials;
  },
};
