import { Inject, Injectable } from '@nestjs/common';
import { InjectWeb3, WEB3_GAS_ARGS, WEB3_UNIQUE } from '@app/uniquesdk/constants';
import { IContractOptions, Web3Connect } from '@app/uniquesdk/sdk.types';
import Web3 from 'web3';

import { ApiPromise } from '@polkadot/api';
import { addressToEvm, evmToAddress } from '@polkadot/util-crypto';
import { signTransaction } from '@app/utils/blockchain';
import { Contract, ContractOptions } from 'web3-eth-contract';
import { MarketConfig } from '@app/config';
import { KeyringPair } from '@polkadot/keyring/types';
import { HelperService } from '@app/helpers/helper.service';
import { IKeyringPair } from '@polkadot/types/types';

@Injectable()
export class Web3Service {
  public web3: Web3;
  private ownerSeed: string;
  public readonly contractHelpersAbi;
  public readonly nonFungibleAbi;
  public readonly marketAbi;

  constructor(@Inject('CONFIG') private config: MarketConfig, private helper: HelperService, @InjectWeb3() public web3conn: Web3Connect) {
    this.web3 = web3conn.web3;
    this.contractHelpersAbi = JSON.parse(this.helper.marketABIStaticFile('contractHelpersAbi.json'));
    this.nonFungibleAbi = JSON.parse(this.helper.marketABIStaticFile('nonFungibleAbi.json'));
    this.marketAbi = JSON.parse(this.helper.marketABIStaticFile('MarketPlace.abi'));
  }

  get getConstractOwnerSeed(): string {
    return this.config.blockchain.unique.contractOwnerSeed;
  }

  get getContractAddress() {
    return this.config.blockchain.unique.contractAddress;
  }

  /**
   * Smart Contract MarketPlaceABI
   * @param {ContractOptions} options - { from: account.address, ...WEB3_GAS_ARGS }
   * @param {string} address - contract address Ethereum
   * @example
   *
   * @returns {Contract}
   */
  smartContractMarketABI(address?: string, options?: ContractOptions): Contract {
    return new this.web3.eth.Contract(this.marketAbi, address, options);
  }

  /**
   * Smart Contract helpers
   * @param caller
   */
  contractHelpers(web3: Web3, caller: string): Contract {
    return new web3.eth.Contract(this.contractHelpersAbi, '0x842899ECF380553E8a4de75bF534cdf6fBF64049', {
      from: caller,
      ...WEB3_GAS_ARGS,
    });
  }

  /**
   *
   * @param api
   * @param address
   */
  async createEthAccountWithBalance(api: ApiPromise, web3, fromOwner = '//Alice') {
    const alice = this.helper.privateKey(fromOwner);
    const account = this.web3.eth.accounts.create();
    this.web3.eth.accounts.wallet.add(account.privateKey);
    await this.transferBalanceToEth(api, alice, account.address);
    return account;
  }

  /**
   * Substrate adress to Ethereum address lowercase
   * @param eth
   */
  subToEthLowercase(eth: string): string {
    const bytes = addressToEvm(eth);
    return '0x' + Buffer.from(bytes).toString('hex');
  }

  /**
   * Substrate address to Ethereum address
   * @param eth
   */
  subToEth(eth: string): string {
    return Web3.utils.toChecksumAddress(this.subToEthLowercase(eth));
  }

  async transferBalanceToEth(api: ApiPromise, admin, target: string, amount = 1000n * WEB3_UNIQUE) {
    const tx = api.tx.balances.transfer(evmToAddress(target), amount);
    return await signTransaction(admin, tx, 'api.tx.balances.transfer');
  }

  createEvmCollection(collectionId: number, from) {
    return new this.web3.eth.Contract(this.nonFungibleAbi, this.collectionIdToAddress(collectionId), { from });
  }

  /**
   *
   * @param api
   * @param admin
   * @param to
   * @param mkTx
   * @param value
   */
  async executeEthTxOnSub(api: ApiPromise, admin, to: any, mkTx: (methods: any) => any, { value = 0 }: { value?: bigint | number } = {}) {
    const tx = api.tx.evm.call(
      this.subToEth(admin.address),
      to.options.address,
      mkTx(to.methods).encodeABI(),
      value,
      WEB3_GAS_ARGS.gas,
      await this.web3.eth.getGasPrice(),
      null,
      null,
      [],
    );
    const result = (await signTransaction(admin, tx, 'api.tx.evm.call')) as any;
    return {
      success: result.result.events.some(({ event: { section, method } }) => section == 'evm' && method == 'Executed'),
      result: result,
    };
  }

  /**
   * Convert collection id to address
   * @param address
   */
  collectionIdToAddress(address: number): string {
    if (address >= 0xffffffff || address < 0) throw new Error('id overflow');
    const buf = Buffer.from([
      0x17,
      0xc4,
      0xe6,
      0x45,
      0x3c,
      0xc4,
      0x9a,
      0xaa,
      0xae,
      0xac,
      0xa8,
      0x94,
      0xe6,
      0xd9,
      0x68,
      0x3e,
      address >> 24,
      (address >> 16) & 0xff,
      (address >> 8) & 0xff,
      address & 0xff,
    ]);
    return Web3.utils.toChecksumAddress('0x' + buf.toString('hex'));
  }

  /**
   *  Unlocks account
   * @param account
   * @param password
   * @param timeout
   */
  unlockAccount(account: string, password: string, timeout = 60) {
    return this.web3.eth.personal.unlockAccount(account, password, timeout);
  }

  disconnect() {
    this.web3conn.provider.connection.close();
  }
}
