import { Inject, Injectable } from '@nestjs/common';
import { green, red } from 'cli-color';
import * as lib from '../../utils/blockchain/web3';

import pretty from 'pino-pretty';
import { seedToAddress } from '@app/utils/blockchain/util';
import { MarketConfig } from '@app/config/market-config';
import { DataSource, Repository } from 'typeorm';
import { Collection } from '@app/entity';
import { CollectionStatus } from '@app/admin/types';
import { SdkStateService } from '@app/uniquesdk/sdk-state.service';
import { InjectUniqueSDK } from '@app/uniquesdk/constants/sdk.injectors';
import { Sdk } from '@unique-nft/substrate-client';
import pino from 'pino';

@Injectable()
export class CheckConfigCommandService {
  private readonly collectionsRepository: Repository<Collection>;
  private logger: pino.Logger;

  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    private sdkState: SdkStateService,
    @InjectUniqueSDK() private readonly uniqueSdk: Sdk,
  ) {
    this.logger = pino(
      pretty({
        colorize: true,
        crlf: false,
        errorLikeObjectKeys: ['err', 'error'],
        errorProps: '',
        levelFirst: true,
        messageKey: 'msg',
        levelKey: 'level',
        messageFormat: false,
        timestampKey: 'time',
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        hideObject: true,
        singleLine: false,

        // The file or file descriptor (1 is stdout) to write to
        destination: 1,

        // Alternatively, pass a `sonic-boom` instance (allowing more flexibility):
        // destination: new SonicBoom({ dest: 'a/file', mkdir: true })

        // You can also configure some SonicBoom options directly
        sync: true, // by default we write asynchronously
        // append: true, // the file is opened with the 'a' flag
        // mkdir: true, // create the target destination
        customPrettifiers: {
          // query: this.messageFormat(log),
        },
      }),
    );
    this.collectionsRepository = connection.getRepository(Collection);
    this.sdkState.connect('unique');
  }

  messageFormat(log, messageKey: string, timestampKey: string) {
    const timer = log[messageKey];

    return timer.toString();
  }
  /**
   *
   * @param balance
   */
  balanceString(balance) {
    return `${balance / lib.UNIQUE} tokens (${balance})`;
  }

  /**
   *
   * @param message
   * @param fatal
   * @param indent
   */
  fail(message, fatal = false, indent = '') {
    this.logger.error(`${red('[x]')} ${message}`);
    if (fatal) process.exit(0);
  }

  /**
   *
   * @param message
   * @param indent
   */
  success(message, indent = '') {
    this.logger.info(`${green('[v]')} ${message}`);
  }

  /**
   *
   * @param collectionId
   * @param api
   * @param indent
   */
  async checkCollection(collectionId, api, indent = '  ') {
    //const collection = (await api.query.common.collectionById(collectionId)).toHuman();
    const collection = (await this.sdkState.collectionById(collectionId)).json;
    if (collection === null) {
      this.fail('Collection does not exists', false, indent);
      return;
    }
    let sponsorship = collection.sponsorship;
    if (typeof collection.sponsorship !== 'string') {
      sponsorship = {};
      for (const key of Object.keys(collection.sponsorship)) {
        sponsorship[key.toLocaleLowerCase()] = collection.sponsorship[key];
      }
    }
    if ((typeof sponsorship === 'string' && sponsorship.toLocaleLowerCase() === 'disabled') || sponsorship.disabled) {
      this.fail(`Sponsoring is disabled`, false, indent);
    } else if (sponsorship.pending) {
      this.fail(`Sponsoring is pending. ${sponsorship.pending} should confirm sponsoring via confirmSponsorship`, false, indent);
    } else if (sponsorship.confirmed) {
      const address = sponsorship.confirmed;
      this.success(`Sponsor is confirmed, ${address}`, indent);
      {
        const balance = (await api.query.system.account(address)).data.free.toBigInt();

        if (balance === 0n) {
          this.fail(`The sponsor's wallet is empty. Transfer some funds to ${address}`, false, indent);
        } else {
          this.success(`Sponsor has ${this.balanceString(balance)} on its substrate wallet`, indent);
        }
      }
      {
        /*
        const balance = (await api.rpc.eth.getBalance(evmAddress)).toBigInt();
        if (balance === 0n) {
          fail(`Ethereum wallet of sponsor is empty. Transfer some funds to ${evmAddress} [${address}]`, false, indent);
        } else {
          success(`Sponsor has ${balanceString(balance)} on its ethereum wallet`, indent);
        }*/
      }
    } else {
      this.fail(`Unknown sponsorship state: ${Object.keys(collection.sponsorship)[0]}`, false, indent);
    }

    {
      const timeout = collection.limits.sponsorTransferTimeout;
      if (timeout === null || timeout.toString() !== '0') {
        this.fail(`Transfer timeout is ${timeout || 'not set (default, non-zero is used)'}`, false, indent);
      } else {
        this.success(`Transfer timeout is zero blocks`, indent);
      }
    }
    {
      const timeout = collection.limits.sponsorApproveTimeout;
      if (timeout === null || timeout.toString() !== '0') {
        this.fail(`Approve timeout is ${timeout || 'not set (default, non-zero is used)'}`, false, indent);
      } else {
        this.success(`Approve timeout is zero blocks`, indent);
      }
    }
  }

  /**
   *
   * @param collectionId
   * @param api
   * @param indent
   */
  async checkoutCollecetionMain() {
    let api, web3, web3conn;
    try {
      web3conn = lib.connectWeb3(this.config.blockchain.unique.wsEndpoint);
      api = this.uniqueSdk.api;
      web3 = web3conn.web3;
    } catch (e) {
      this.fail(`Unable to connect to UNIQUE_WS_ENDPOINT (${this.config.blockchain.unique.wsEndpoint})`, true);
    }

    this.logger.info(`UNIQUE_WS_ENDPOINT: ${this.config.blockchain.unique.wsEndpoint}`);

    if (!this.config.blockchain.escrowSeed) {
      this.fail('No ESCROW_SEED provided');
    } else {
      const escrowAddress = await seedToAddress(this.config.blockchain.escrowSeed);
      this.success(`Escrow address (Extracted from ESCROW_SEED): ${escrowAddress}`);
      {
        const balance = (await api.query.system.account(escrowAddress)).data.free.toBigInt();
        this.logger.info(`Escrow balance: ${this.balanceString(balance)}`);
      }
    }

    this.logger.info('\nChecking CONTRACT_ADDRESS');

    let validContract = false;

    if (this.config.blockchain.unique.contractAddress) {
      let code = '';
      try {
        code = await api.rpc.eth.getCode(this.config.blockchain.unique.contractAddress);
      } catch (e) {
        code = '';
      }
      validContract = code.length > 0;
    } else {
      this.fail(
        'No contract address provided. You must set CONTRACT_ADDRESS env variable, or override blockchain.unique.contractAddress in config',
      );
    }
    if (validContract) {
      const address = this.config.blockchain.unique.contractAddress;
      this.success(`Contract address valid: ${address}`);
      const balance = (await api.rpc.eth.getBalance(this.config.blockchain.unique.contractAddress)).toBigInt();
      if (balance === 0n) {
        this.fail(`Contract balance is zero, transactions will be failed via insufficient balance error`);
      } else {
        this.success(`Contract balance is ${this.balanceString(balance)}`);
      }
      const sponsoring = (await this.sdkState.selfSponsoring(address)).json;
      const sponsoringMode = (await this.sdkState.sponsoringMode(address)).json;
      const allowedModes = ['Generous', 'Allowlisted'];
      if (allowedModes.indexOf(sponsoringMode) === -1 && !sponsoring) {
        this.fail(`Contract self-sponsoring is not enabled. You should call setSponsoringMode first`);
      } else {
        this.success(`Contract self-sponsoring is enabled`);
      }
      const rateLimit = (await api.query.evmContractHelpers.sponsoringRateLimit(address)).toJSON() as number;
      if (rateLimit !== 0) {
        this.fail(`Rate limit is not zero, users should wait ${rateLimit} blocks between calling sponsoring`);
      } else {
        this.success(`Rate limit is zero blocks`);
      }
    } else if (this.config.blockchain.unique.contractAddress) {
      this.fail(`Contract address invalid: ${this.config.blockchain.unique.contractAddress}`);
    }
    if (this.config.blockchain.unique.contractOwnerSeed) {
      try {
        const account = web3.eth.accounts.privateKeyToAccount(this.config.blockchain.unique.contractOwnerSeed);
        this.success(`Contract owner valid, owner address: ${account.address}`);
        const balance = (await api.rpc.eth.getBalance(account.address)).toBigInt();
        this.logger.info(`Contract owner balance is ${this.balanceString(balance)}`);
      } catch (e) {
        this.fail(`Invalid contract owner seed (${this.config.blockchain.unique.contractOwnerSeed})`);
      }
    } else {
      this.fail(
        'No contract owner seed provided. You must set CONTRACT_ETH_OWNER_SEED env variable or override blockchain.unique.contractOwnerSeed in config',
      );
    }
    const collectionIds = await this.getCollectionIds();
    this.logger.info('\nChecking UNIQUE_COLLECTION_IDS');
    for (const collectionId of collectionIds) {
      this.logger.info(`Collection #${collectionId}`);
      await this.checkCollection(collectionId, api);
    }

    web3conn.provider.connection.close();
    await api.disconnect();
    process.exit(0);
  }

  async getCollectionIds(): Promise<number[]> {
    const collections = await this.collectionsRepository.find({ where: { status: CollectionStatus.Enabled } });

    return collections.map((i) => Number(i.id));
  }
}
