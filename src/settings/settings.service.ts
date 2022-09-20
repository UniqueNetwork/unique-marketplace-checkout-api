import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, Not, Repository } from 'typeorm';
import { SettingsDto } from './dto';

import { seedToAddress, vec2str } from '@app/utils/blockchain/util';
import { MarketConfig } from '@app/config/market-config';
import { Collection } from '@app/entity';
import { CollectionStatus } from '@app/admin/types/collection';
import { SettingsEntity } from '@app/entity/settings';
import { SdkStateService, SdkTokensService } from '@app/uniquesdk';
import * as lib from '@app/utils/blockchain/web3';
import { subToEthLowercase } from '@app/utils/blockchain/web3';
import { cryptoWaitReady, decodeAddress, encodeAddress, evmToAddress } from '@polkadot/util-crypto';
import Web3 from 'web3';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly collectionsRepository: Repository<Collection>;
  private readonly settingsRepository: Repository<SettingsEntity>;
  private api;
  private web3conn;
  private web3;
  private ownerSeed: string;

  constructor(
    @Inject('CONFIG') private config: MarketConfig,
    private connection: DataSource,
    private sdkStateUnique: SdkStateService,
    private sdkStateKusama: SdkStateService,
    private sdkTokens: SdkTokensService,
  ) {
    this.sdkStateUnique.connect('unique');
    this.sdkStateKusama.connect('kusama');
    this.sdkTokens.connect('unique');
    this.api = this.sdkStateUnique.api;
    this.collectionsRepository = connection.getRepository(Collection);
    this.settingsRepository = connection.getRepository(SettingsEntity);
    this.web3conn = lib.connectWeb3(config.blockchain.unique.wsEndpoint);

    this.web3 = this.web3conn.web3;
    this.ownerSeed = config.blockchain.unique.contractOwnerSeed;
  }

  /**
   * Prepare settings for market
   * @returns {Promise<SettingsDto>}
   */
  async prepareSettings(): Promise<SettingsDto> {
    let mainSaleAddress;
    const { blockchain, auction, marketType, bulkSaleSeed, adminList } = this.config;
    // Admin list

    const administrators = adminList.length > 0 ? adminList.split(',').map((value) => value.trim()) : [];

    // Main sale address
    if (this.config.bulkSaleSeed && this.config.bulkSaleSeed != '') {
      try {
        mainSaleAddress = await seedToAddress(bulkSaleSeed);
        administrators.push(mainSaleAddress);
      } catch (e) {
        this.logger.error('Main sale seed is invalid');
      }
    }

    // Collections list
    const collectionIds = await this.getCollectionIds();
    // Allowed tokens
    const allowedTokens = await this.getAllowedTokens();

    const settings: SettingsDto = {
      marketType: marketType,
      administrators: this.adminList,
      mainSaleSeedAddress: mainSaleAddress,
      blockchain: {
        escrowAddress: await seedToAddress(blockchain.escrowSeed),
        unique: {
          wsEndpoint: blockchain.unique.wsEndpoint,
          collectionIds,
          allowedTokens,
          contractAddress: blockchain.unique.contractAddress,
        },
        kusama: {
          wsEndpoint: blockchain.kusama.wsEndpoint,
          marketCommission: blockchain.kusama.marketCommission.toString(),
        },
      },
    };

    if (auction.seed) {
      try {
        let auctionAddress = await seedToAddress(auction.seed);
        auctionAddress = await this.convertSubstrateAddress(auctionAddress, this.sdkStateUnique.api.registry.chainSS58);

        settings.auction = {
          commission: auction.commission,
          address: auctionAddress,
        };
      } catch (error) {
        this.logger.warn(error);
      }
    }

    return settings;
  }

  /**
   * Get settings
   *  @returns {Promise<SettingsDto>}
   */
  async getSettings(): Promise<SettingsDto> {
    return await this.prepareSettings();
  }

  /**
   * Get collections ids
   * @returns {Promise<number[]>}
   */
  async getCollectionIds(): Promise<number[]> {
    const collections = await this.collectionsRepository.find({ where: { status: CollectionStatus.Enabled } });
    return collections.map((i) => Number(i.id));
  }

  /**
   * Set first launch market
   * @returns {Promise<void>}
   */
  async markFirstLaunchMarket(): Promise<void> {
    const settings = await this.settingsRepository.findOne({
      where: { name: 'firstLaunchMarket' },
    });

    if (!settings) {
      await this.settingsRepository.save({
        name: 'firstLaunchMarket',
        property: 'true',
      });
    }
  }

  get adminList() {
    const { adminList } = this.config;
    if (adminList.length > 0) {
      const arrayList = this.config.adminList.split(',').map((value) => encodeAddress(value.trim()));
      return arrayList.filter((value, index, self) => index === self.findIndex((t) => t === value && t === value));
    } else {
      return [];
    }
  }

  /**
   * Get first launch market
   *  @returns {Promise<boolean>}
   */
  async isFirstLaunchMarket(): Promise<boolean> {
    const settings = await this.settingsRepository.findOne({
      where: { name: 'firstLaunchMarket' },
    });
    return settings ? true : false;
  }

  /**
   * Get allowed tokens
   * @returns {Promise<string[]>}
   * @private
   */
  private async getAllowedTokens(): Promise<any> {
    const collections = await this.collectionsRepository.find({
      where: {
        status: CollectionStatus.Enabled,
        allowedTokens: Not(''),
      },
    });
    return collections.map((i) => {
      return { collection: Number(i.id), tokens: i.allowedTokens };
    });
  }

  /**
   *  Checkout congifigration market
   *  @description Сheck the existence of the collection in the blockchain, check the state of the contract and return its state.
   */
  async checkConfig(): Promise<any> {
    const collectionData = new Map();

    const collectionIds = await this.getCollectionIds();
    const escrowMap = new Map();
    const auctionMap = new Map();

    if (!this.config.blockchain.escrowSeed) {
      escrowMap.set('Seed', 'Not set');
    } else {
      const escrowAddress = await seedToAddress(this.config.blockchain.escrowSeed);
      escrowMap.set('Seed', escrowAddress);
      {
        const balance = (await this.api.query.system.account(escrowAddress)).data.free.toBigInt();
        escrowMap.set('Balance', `${this.balanceString(balance)}`);
      }
    }

    if (!this.config.auction.seed) {
      auctionMap.set('Seed', 'Not set');
    } else {
      const auctionAddress = await seedToAddress(this.config.auction.seed);
      auctionMap.set('Seed', auctionAddress);
      {
        const balance = (await this.api.query.system.account(auctionAddress)).data.free.toBigInt();
        auctionMap.set('Balance', `${this.balanceString(balance)}`);
      }
    }

    collectionData.set('Escrow', Object.fromEntries(escrowMap));
    collectionData.set('Auction', Object.fromEntries(auctionMap));
    collectionData.set('Contract', await this.checkContract());
    collectionData.set('Check collections', []);
    for (const collectionId of collectionIds) {
      const checkCollMap = collectionData.get('Check collections');

      const infoCollection = await this.checkCollection(collectionId.toString());
      checkCollMap.push(infoCollection);
    }
    const data = Object.fromEntries(collectionData);
    return data;
  }

  /**
   * Check contract
   * @description Check the state of the contract and return its state.
   * @returns {Promise<any>}
   */
  async checkContract(): Promise<any> {
    const contractData = new Map();
    let validContract = false;

    if (this.config.blockchain.unique.contractAddress) {
      let code = '';
      try {
        code = await this.sdkStateUnique.api.rpc.eth.getCode(this.config.blockchain.unique.contractAddress);
      } catch (e) {
        code = '';
      }
      validContract = code.length > 0;
    } else {
      contractData.set(
        'WARNING',
        'No contract address provided. You must set CONTRACT_ADDRESS env variable, or override blockchain.unique.contractAddress in config',
      );
    }

    if (validContract) {
      const address = this.config.blockchain.unique.contractAddress;
      contractData.set('Address', address);
      contractData.set('Mirror', await this.addSubstrateMirror(this.config.blockchain.unique.contractAddress));

      const balance = (await this.sdkStateUnique.api.rpc.eth.getBalance(this.config.blockchain.unique.contractAddress)).toBigInt();
      if (balance === 0n) {
        contractData.set('Balance', `Contract balance is zero, transactions will be failed via insufficient balance error`);
      } else {
        contractData.set('Balance', `${this.balanceString(balance)}`);
      }
      const sponsoring = (await this.sdkStateUnique.api.query.evmContractHelpers.selfSponsoring(address)).toJSON();
      const sponsoringMode = (await this.sdkStateUnique.api.query.evmContractHelpers.sponsoringMode(address)).toJSON();
      const allowedModes = ['Generous', 'Allowlisted'];
      if (allowedModes.indexOf(sponsoringMode) === -1 && !sponsoring) {
        contractData.set('Self-sponsoring', `Contract self-sponsoring is not enabled. You should call setSponsoringMode first`);
      } else {
        contractData.set('Self-sponsoring', `Contract self-sponsoring is enabled`);
      }
      const rateLimit = (await this.sdkStateUnique.api.query.evmContractHelpers.sponsoringRateLimit(address)).toJSON() as number;
      if (rateLimit !== 0) {
        contractData.set('Rate limit', `Rate limit is not zero, users should wait ${rateLimit} blocks between calling sponsoring`);
      } else {
        contractData.set('Rate limit', `Rate limit is zero blocks`);
      }
    } else if (this.config.blockchain.unique.contractAddress) {
      contractData.set('Address', `Contract address invalid: ${this.config.blockchain.unique.contractAddress}`);
    }
    return Object.fromEntries(contractData);
  }

  private async addSubstrateMirror(address) {
    return `${evmToAddress(address)}`;
  }

  /**
   * @async
   * Check collection
   * @description Check the state of the collection and return its state.
   * @param collectionId
   * @returns {Promise<any>}
   */
  async checkCollection(collectionId: string) {
    const collectionList = new Map();
    const collection = (await this.sdkStateUnique.collectionById(collectionId)).json;
    if (collection === null) {
      collectionList.set('status', 'undefined');
      return collectionList;
    }
    collectionList.set('Collection', collectionId);
    collectionList.set('Name', vec2str(collection.name));
    collectionList.set('Description', vec2str(collection.description));
    const collectionTokens = await this.sdkStateUnique.api.rpc.unique.collectionTokens(collectionId);
    collectionList.set('Tokens', collectionTokens.length);
    let sponsorship = collection.sponsorship;
    if (typeof collection.sponsorship !== 'string') {
      sponsorship = {};
      for (const key of Object.keys(collection.sponsorship)) {
        sponsorship[key.toLocaleLowerCase()] = collection.sponsorship[key];
      }
    }
    if ((typeof sponsorship === 'string' && sponsorship.toLocaleLowerCase() === 'disabled') || sponsorship.disabled) {
      collectionList.set('Sponsorship', 'DISABLED');
    } else if (sponsorship.pending) {
      collectionList.set('Sponsorship', `PENDING. ${sponsorship.pending} should confirm sponsoring via confirmSponsorship`);
    } else if (sponsorship.confirmed) {
      const address = sponsorship.confirmed;
      collectionList.set('Sponsorship Confirmed', true);
      collectionList.set('Sponsorship Substrate', `${address}`);

      {
        const balance = (await this.sdkStateUnique.api.query.system.account(address)).data.free.toBigInt();

        if (balance === 0n) {
          collectionList.set('Balance', `Sponsoring is confirmed. ${address} but balance is 0`);
        } else {
          collectionList.set('Balance', `Sponsor has ${this.balanceString(balance)} on its substrate wallet`);
        }
      }
    } else {
      collectionList.set('Sponsorship', `${Object.keys(collection.sponsorship)[0].toUpperCase()}`);
    }
    collectionList.set('Limits', collection.limits);

    return Object.fromEntries(collectionList);
  }

  /**
   * Convert balance
   * @description Convert balance to string
   * @param balance
   * @returns {string}
   */
  private balanceString(balance) {
    return `${balance / lib.UNIQUE} coins (${balance})`;
  }

  /**
   *
   * @param eth
   */
  convertSubstrateToEthereum(eth: string): string {
    return Web3.utils.toChecksumAddress(subToEthLowercase(eth));
  }

  /**
   *
   * @param address
   * @param ss58Format
   */
  async convertSubstrateAddress(address: string, ss58Format?: number): Promise<string> {
    await cryptoWaitReady();
    return encodeAddress(decodeAddress(address), ss58Format);
  }

  /**
   * Check address
   * @description Convert substrate address to other formats.
   * @async
   * @param address
   * @param ss58FormatData
   * @returns {Promise<any>}
   */
  async checkSubtrateAddress(address: string, ss58FormatData?: number): Promise<any> {
    if (address === undefined) {
      throw new NotFoundException('Address not found');
    }

    const dataAddress = new Map<string, any>();
    const polkadotAddress = [];
    if (typeof address === 'string') {
      if (address.length === 48 || address.length === 47) {
        if (ss58FormatData !== undefined) {
          //polkadotAddress.set('Address', await this.convertSubstrateAddress(address, ss58Format));
        }
        dataAddress.set('Ethereum', this.convertSubstrateToEthereum(address));

        polkadotAddress.push({ ss58Format: 0, name: 'Normalized', address: encodeAddress(decodeAddress(address)) });
        polkadotAddress.push({ ss58Format: 2, network: 'Kusama', adress: await this.convertSubstrateAddress(address, 2) });
        polkadotAddress.push({ ss58Format: 42, name: 'Opal', address: await this.convertSubstrateAddress(address, 42) });
        polkadotAddress.push({ ss58Format: 255, name: 'Quartz', address: await this.convertSubstrateAddress(address, 255) });
        polkadotAddress.push({ ss58Format: 7391, network: 'Unique', address: await this.convertSubstrateAddress(address, 7391) });

        dataAddress.set(
          'Polkadot',
          polkadotAddress.sort((a, b) => a.ss58Format - b.ss58Format),
        );
        dataAddress.set('DecodeAddress', await decodeAddress(address));
      } else if (address.length === 42 && address.startsWith('0x')) {
        throw new BadRequestException('Invalid address! Not convert Ethereum address to Substrate address!');
      } else if (address.length === 40 && !address.startsWith('0x')) {
        throw new BadRequestException('Invalid address! Not convert Ethereum address to Substrate address!');
      } else {
        throw new BadRequestException(`Unknown address format: "${address}"`);
      }
    }

    return Object.fromEntries(dataAddress);
  }
}
