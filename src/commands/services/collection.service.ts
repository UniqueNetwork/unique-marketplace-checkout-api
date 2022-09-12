import { Inject, Injectable } from '@nestjs/common';

import { bgGreen, bgRed, black, cyan, yellow } from 'cli-color';
import { MarketConfig } from '@app/config';
import { ICollectionCommand } from '../interfaces/collection.interface';
import { SdkProvider } from '../../uniquesdk/sdk-provider';
import { InjectUniqueSDK } from '@app/uniquesdk';

@Injectable()
export class CollectionCommandService {
  constructor(@Inject('CONFIG') private config: MarketConfig, @InjectUniqueSDK() private readonly uniqueProvider: SdkProvider) {}

  async showCollection(data: ICollectionCommand): Promise<any> {
    const { collection, token, depth } = data;

    // Checkout flag wss endpoint
    console.log(cyan('============== WSS Connected =============='), yellow(true));
    console.log(cyan('WS endpoint:'), yellow(this.config.blockchain.unique.wsEndpoint));

    // Checkout collection ID
    const collectionNew = await this.uniqueProvider.collectionsService.collectionById(+collection);

    console.log(cyan('Collection ID:'), yellow(collection));
    if (collectionNew.sponsorship !== undefined && collectionNew.sponsorship !== null) {
      Object.entries(collectionNew.sponsorship).map(([key, value]) => {
        if (key === 'Unconfirmed') {
          console.log(cyan('Collection Sponsorship:'), bgRed(black(' ' + key.toUpperCase() + ' ')));
        } else {
          console.log(cyan('Collection Sponsorship:'), yellow(value), bgGreen(black(' ' + key.toUpperCase() + ' ')));
        }
      });
    }

    // console.dir(collectionData, { depth: depth });

    console.dir(collectionNew, { depth: depth });

    // Checkout token id
    if (token) {
      console.log(cyan('Token ID:'), yellow(token));
      const tokenNew = await this.uniqueProvider.tokensService.tokenData(+token, +collection);
      console.dir(tokenNew, { depth: depth });

      // Checkout token is bundle
      const tokenIsBundle = await this.uniqueProvider.tokensService.isBundle(+token, +collection);
      console.log(cyan('Token is bundle:'), yellow(tokenIsBundle));

      if (tokenIsBundle) {
        console.log(cyan('Get nested token:'));
        const tokenNested = await this.uniqueProvider.tokensService.getBundle(+token, +collection);
        console.dir(tokenNested, { depth: depth });
      }
    } else {
      console.log(cyan('Token ID:'), yellow(1));
      const tokenNew = await this.uniqueProvider.tokensService.tokenData(1, +collection);
      console.dir(tokenNew, { depth: depth });
    }
    await this.uniqueProvider.disconnect();

    console.log(cyan('============== WSS Disconnected =============='), yellow(true));
    process.exit(0);
  }

  async checkBalance() {
    const getPriceWithoutCommissionNew = (price: bigint) => {
      return (price * (100n - BigInt(this.config.blockchain.kusama.marketCommission))) / 100n;
    };

    const getPriceWithoutCommissionOld = (price: bigint) => {
      return price - BigInt((Number(price) * this.config.blockchain.kusama.marketCommission) / 100);
      //return price * ((100n - BigInt(parseInt(this.config('kusama.marketCommission')))) / 100n);
    };

    console.log('example playground main');
    console.log('every playground file must export "async main(moduleRef, args: string[])" function');
    const numOld = getPriceWithoutCommissionOld(BigInt(100_000_000_000));
    const numNew = getPriceWithoutCommissionNew(BigInt(100_000_000_000));
    console.log(numOld);
    console.log(numNew);
  }
}
