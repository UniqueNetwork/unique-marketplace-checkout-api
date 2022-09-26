import { Sdk } from '@unique-nft/substrate-client';
import '@unique-nft/substrate-client/state-queries';
import '@unique-nft/substrate-client/tokens';
import '@unique-nft/substrate-client/balance';
import '@unique-nft/substrate-client/extrinsics';
import { TransferArguments } from '@unique-nft/substrate-client/tokens';
import { SdkSigner } from '@unique-nft/substrate-client/types';
import { Injectable } from '@nestjs/common';
import { ApiPromise } from '@polkadot/api';
import { KeyringOptions } from '@polkadot/keyring/types';
import { KeyringProvider } from '@unique-nft/accounts/keyring';

@Injectable()
export class SdkTestService {
  public sdk: Sdk;
  public api: ApiPromise;

  async connect(config: any, network: string, seed?: string) {
    this.sdk = await Sdk.create({ chainWsUrl: config.blockchain[network].wsEndpoint });

    console.log(config.blockchain[network].wsEndpoint);
    this.api = this.sdk.api;
  }

  async tranferToken(addressFrom: string, addressTo: string, collectionId: number, tokenId: number, seed: SdkSigner): Promise<any> {
    const args: TransferArguments = {
      address: addressFrom, //  Address seller
      to: addressTo, // Adress auction
      collectionId: collectionId,
      tokenId: tokenId,
    };

    const transfer = await this.sdk.tokens.transfer.sign(args, { signer: seed }); // seed seller
    //const submit = await this.sdk.tokens.transfer.getFee(transfer);

    // const signer = await this.sdk.extrinsics.sign(transfer, seed);

    return { transfer };
  }

  async convertSeedToSdkSigner(seed: string): Promise<SdkSigner> {
    const options: KeyringOptions = {
      type: 'sr25519',
    };
    const provider = new KeyringProvider(options);
    await provider.init();
    const account = provider.addSeed(seed);
    return account?.getSigner();
  }
}
