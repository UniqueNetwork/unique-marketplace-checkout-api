import { INestApplication } from '@nestjs/common';
import { Keyring, ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { generateAccount, SignatureType, SdkSigner } from '@unique-nft/accounts';
import { AccountData } from '@unique-nft/accounts';
import { Account } from '@unique-nft/accounts';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { AllBalances } from '@unique-nft/substrate-client/types';
import { UNIQUE_SDK_PROVIDER, KUSAMA_SDK_PROVIDER, SdkProvider, NetworkNameState } from '@app/uniquesdk';

export class TestAccounts {
  private readonly uniqueProvider: SdkProvider;
  private readonly kusamaProvider: SdkProvider;

  public bankAccount: Account<KeyringPair>;
  public escrowAccount: Account<KeyringPair>;
  public auctionAccount: Account<KeyringPair>;
  public bestsellerAccount: Account<KeyringPair>;
  public mechantAccount: Account<KeyringPair>;

  public seller: AccountData;
  public buyer: AccountData;
  public bidder: AccountData;

  constructor(private readonly app: INestApplication) {
    this.uniqueProvider = this.app.get<SdkProvider>(UNIQUE_SDK_PROVIDER);
    this.kusamaProvider = this.app.get<SdkProvider>(KUSAMA_SDK_PROVIDER);
  }

  public async checkBankSeed() {
    if (!process.env.BANK_SEED) {
      throw new Error('Not found BANK_SEED env');
    }
    const keyringPair = new Keyring({ type: 'sr25519' }).addFromUri(process.env.BANK_SEED);
    const resUnique = await this.uniqueProvider.api.query.system.account(keyringPair.addressRaw);
    const resKusama = await this.kusamaProvider.api.query.system.account(keyringPair.addressRaw);
    return resUnique.toJSON().nonce !== 0 && resKusama.toJSON().nonce !== 0;
  }

  public async init() {
    const bankAccountExits = this.checkBankSeed();
    if (!bankAccountExits) {
      throw new Error('Bank account is not exits');
    }
    const provider = new KeyringProvider({ type: SignatureType.Sr25519 });
    await provider.init();

    this.bankAccount = provider.addSeed(process.env.BANK_SEED);

    const uniqueAllBalances = await this.getAccountBalance(this.bankAccount.instance.address, NetworkNameState.UNIQUE);

    if (BigInt(uniqueAllBalances.freeBalance.raw) === 0n) {
      throw new Error(`Bank balance unique is ${uniqueAllBalances.freeBalance.raw}`);
    }

    const kusamaAllBalances = await this.getAccountBalance(this.bankAccount.instance.address, NetworkNameState.KUSAMA);

    if (BigInt(kusamaAllBalances.freeBalance.raw) === 0n) {
      throw new Error(`Bank balance rusama is ${kusamaAllBalances.freeBalance.raw}`);
    }
    // Escrow
    if (!process.env.ESCROW_SEED) {
      throw new Error('Not found ESCROW_SEED env');
    }
    this.escrowAccount = provider.addSeed(process.env.ESCROW_SEED);

    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.escrowAccount.instance.address,
      100,
      this.bankAccount.getSigner(),
      NetworkNameState.UNIQUE,
    );
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.escrowAccount.instance.address,
      100,
      this.bankAccount.getSigner(),
      NetworkNameState.KUSAMA,
    );
    // Auction
    if (!process.env.AUCTION_SEED) {
      throw new Error('Not found AUCTION_SEED env');
    }
    this.auctionAccount = provider.addSeed(process.env.AUCTION_SEED);
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.auctionAccount.instance.address,
      100,
      this.bankAccount.getSigner(),
      NetworkNameState.UNIQUE,
    );
    // Bestseller
    if (!process.env.BESTSELLER_SEED) {
      throw new Error('Not found BESTSELLER_SEED env');
    }
    this.bestsellerAccount = provider.addSeed(process.env.BESTSELLER_SEED);
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.bestsellerAccount.instance.address,
      100,
      this.bankAccount.getSigner(),
      NetworkNameState.UNIQUE,
    );
    // Merchant
    if (!process.env.MERCHANT_SEED) {
      throw new Error('Not found MERCHANT_SEED env');
    }
    this.mechantAccount = provider.addSeed(process.env.MERCHANT_SEED);
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.mechantAccount.instance.address,
      100,
      this.bankAccount.getSigner(),
      NetworkNameState.UNIQUE,
    );

    this.seller = await generateAccount({
      pairType: SignatureType.Sr25519,
      meta: {
        name: 'seller',
      },
    });
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.seller.keyfile.address,
      10,
      this.bankAccount.getSigner(),
      NetworkNameState.KUSAMA,
    );

    this.buyer = await generateAccount({
      pairType: SignatureType.Sr25519,
      meta: {
        name: 'buyer',
      },
    });
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.buyer.keyfile.address,
      10,
      this.bankAccount.getSigner(),
      NetworkNameState.KUSAMA,
    );

    this.bidder = await generateAccount({
      pairType: SignatureType.Sr25519,
      meta: {
        name: 'bidder',
      },
    });
    await this.updateNullBalance(
      this.bankAccount.instance.address,
      this.bidder.keyfile.address,
      10,
      this.bankAccount.getSigner(),
      NetworkNameState.KUSAMA,
    );
  }

  private async updateNullBalance(
    sourceAddress: string,
    destinationAddress: string,
    amount: number,
    signer: SdkSigner,
    network: NetworkNameState,
  ) {
    const destinationBalance = await this.getAccountBalance(destinationAddress, network);
    if (BigInt(destinationBalance.freeBalance.raw) === 0n) {
      await this.balanceTransfer(sourceAddress, destinationAddress, amount, signer, network);
    }
  }

  public async getAccountBalance(address: string, network: NetworkNameState): Promise<AllBalances> {
    const sdk = network === NetworkNameState.UNIQUE ? this.uniqueProvider.sdk : this.kusamaProvider.sdk;
    return sdk.balance.get({ address });
  }

  public async balanceTransfer(
    sourceAddress: string,
    destinationAddress: string,
    amount: number,
    signer: SdkSigner,
    network: NetworkNameState,
  ) {
    const sdk = network === NetworkNameState.UNIQUE ? this.uniqueProvider.sdk : this.kusamaProvider.sdk;
    return sdk.balance.transfer.submitWaitResult(
      {
        address: sourceAddress,
        destination: destinationAddress,
        amount,
      },
      { signer },
    );
  }

  public async destroyTestAccounts() {
    await this.clearAccount(
      this.bankAccount.instance.address,
      NetworkNameState.KUSAMA,
      new KeyringProvider({
        type: SignatureType.Sr25519,
      }).addSeed(this.seller.mnemonic).instance,
    );
    await this.clearAccount(
      this.bankAccount.instance.address,
      NetworkNameState.KUSAMA,
      new KeyringProvider({
        type: SignatureType.Sr25519,
      }).addSeed(this.buyer.mnemonic).instance,
    );
    await this.clearAccount(
      this.bankAccount.instance.address,
      NetworkNameState.KUSAMA,
      new KeyringProvider({
        type: SignatureType.Sr25519,
      }).addSeed(this.bidder.mnemonic).instance,
    );
  }

  private async clearAccount(address: string, network: NetworkNameState, keyring: KeyringPair) {
    const sdk = network === NetworkNameState.UNIQUE ? this.uniqueProvider.sdk : this.kusamaProvider.sdk;
    const api = sdk.api as ApiPromise;
    const txTransferAll = await api.tx.balances.transferAll(address, false).signAsync(keyring);
    return this.kusamaProvider.extrinsicServices.submit(txTransferAll);
  }
}
