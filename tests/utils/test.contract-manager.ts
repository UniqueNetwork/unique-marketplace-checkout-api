import { Web3Service } from '@app/uniquesdk/web3.service';

import { join } from 'path';
import { TestHelper } from './test.helper';
import * as fs from 'fs';
import { SdkProvider, SponsoringMode, WEB3_GAS_ARGS, WEB3_UNIQUE } from '@app/uniquesdk';
import { IKeyringPair } from '@polkadot/types/types';
import { MarketConfig } from '@app/config';
import { INestApplication } from '@nestjs/common';
import { HelperService } from '@app/helpers/helper.service';
import { EscrowService } from '@app/escrow/service';
import { UniqueEscrow } from '@app/escrow';
import { Contract } from 'web3-eth-contract';
import Web3 from 'web3';
import { Account } from 'web3-core';

export class TestContractManager {
  app: INestApplication;
  config: MarketConfig;
  uniqueProvider: SdkProvider;
  web3service: Web3Service;
  testHelper: TestHelper;
  web3: Web3;
  web3conn;
  helper: HelperService;
  contract: Contract;
  contractOwner: Account;
  service: EscrowService;
  escrowSeed: IKeyringPair;
  blocks;
  contractHelper;
  TEST_GAS = 10000000;
  CONTRACT_ETH_OWNER_SEED = 'CONTRACT_ETH_OWNER_SEED';
  CONTRACT_ADDRESS = 'CONTRACT_ADDRESS';

  constructor(app: INestApplication) {
    /** Init app **/
    this.app = app;
    /** Init config **/
    this.config = app.get('CONFIG');
    /** Init unique provider **/
    this.uniqueProvider = app.get<SdkProvider>('UNIQUE_SDK_PROVIDER');
    /** Init web3service **/
    this.web3service = app.get<Web3Service>(Web3Service);
    /** Init web3 **/
    this.web3conn = this.web3service.web3conn;
    this.web3 = this.web3service.web3;
    /** Init helper service. To use auxiliary data processing methods **/
    this.helper = app.get(HelperService);
    /** Init Escrow service **/
    this.service = app.get(EscrowService);

    this.testHelper = new TestHelper();
  }

  /**
   * Init test
   * @param app
   * @param config
   * @param uniqueProvider
   * @param web3conn
   * @param helper
   */
  async init() {
    this.escrowSeed = this.helper.privateKey(this.config.blockchain.escrowSeed);
    await this.deploy(this.escrowSeed);
    this.blocks = {
      start: 0,
      latest: (await this.uniqueProvider.sdk.api.rpc.chain.getHeader()).number.toNumber(),
      async updateLatest() {
        this.start = this.latest;
        this.latest = (await this.uniqueProvider.sdk.api.rpc.chain.getHeader()).number.toNumber();
      },
    };

    expect(this.config.mode).toBe('test');
    return this;
  }

  /**
   * Deploy contract
   * @param admin
   * @param uniqueProvider
   * @param web3conn
   * @param config
   */
  private async deploy(admin: IKeyringPair): Promise<void> {
    const contractAddress = this.config.blockchain.unique.contractAddress;
    const contractOwnerSeed = this.config.blockchain.unique.contractOwnerSeed;
    let balanseContract = true;

    if (contractAddress || contractOwnerSeed) {
      const balance = (await this.uniqueProvider.sdk.api.rpc.eth.getBalance(contractAddress)).toBigInt();
      if (balance < 50n * WEB3_UNIQUE) {
        process.env.CONTRACT_ETH_OWNER_SEED = '';
        process.env.CONTRACT_ADDRESS = '';
        await this.testHelper.updateTestEnvironment(this.CONTRACT_ETH_OWNER_SEED, '');
        await this.testHelper.updateTestEnvironment(this.CONTRACT_ADDRESS, '');
        balanseContract = false;
        console.log('Low balance contract address: ', contractAddress);
      }
    }
    // Check balance contract
    if (balanseContract) {
      this.contractOwner = this.web3service.web3.eth.accounts.privateKeyToAccount(contractOwnerSeed);
      this.web3service.web3.eth.accounts.wallet.add(this.contractOwner.privateKey);
      this.contract = new this.web3service.web3.eth.Contract(JSON.parse(this.testHelper.readBCStatic('MarketPlace.abi')), contractAddress);
      this.contractHelper = this.web3service.contractHelpers(this.web3, this.contractOwner.address);
      return;
    }

    const contractOwner = await this.web3service.createEthAccountWithBalance(
      this.uniqueProvider.sdk.api,
      this.web3service.web3,
      this.config.blockchain.escrowSeed,
    );
    const contractAbi = new this.web3.eth.Contract(JSON.parse(this.testHelper.readBCStatic('MarketPlace.abi')), undefined, {
      from: contractOwner.address,
      ...WEB3_GAS_ARGS,
    });

    const contract = await contractAbi
      .deploy({ data: this.testHelper.readBCStatic('MarketPlace.bin') })
      .send({ from: contractOwner.address, gas: this.TEST_GAS });
    await contract.methods.setEscrow(contractOwner.address, true).send({ from: contractOwner.address });
    const contractHelper = this.web3service.contractHelpers(this.web3conn.web3, contractOwner.address);

    await contractHelper.methods
      .setSponsoringMode(contract.options.address, SponsoringMode.Allowlisted)
      .send({ from: contractOwner.address });
    expect((await this.uniqueProvider.sdk.api.query.evmContractHelpers.sponsoringMode(contract.options.address)).toJSON()).toBe(
      'Allowlisted',
    );

    await contractHelper.methods.setSponsoringRateLimit(contract.options.address, 0).send({ from: contractOwner.address });
    expect((await this.uniqueProvider.sdk.api.query.evmContractHelpers.sponsoringRateLimit(contract.options.address)).toJSON()).toBe(0);

    await this.web3service.transferBalanceToEth(this.uniqueProvider.sdk.api, admin, contract.options.address);

    await this.testHelper.updateTestEnvironment(this.CONTRACT_ETH_OWNER_SEED, contractOwner.privateKey);
    await this.testHelper.updateTestEnvironment(this.CONTRACT_ADDRESS, contract.options.address);

    process.env.CONTRACT_ETH_OWNER_SEED = contractOwner.privateKey;
    process.env.CONTRACT_ADDRESS = contract.options.address;

    this.contract = contract;
    this.contractOwner = contractOwner;
    this.contractHelper = contractHelper;
  }
}
