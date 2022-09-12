import { SearchIndexService } from '@app/auction/services/search-index.service';
import { ModuleRef } from '@nestjs/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { encodeAddress, evmToAddress } from '@polkadot/util-crypto';

import * as logging from '../utils/logging';
import { AccountPairs, BlockchainBlock, Collection, MarketTrade, MoneyTransfer, NFTTransfer, OffersEntity, SearchIndex } from '@app/entity';
import { ASK_STATUS, IOfferInsertData, IRegisterTransferData, MONEY_TRANSFER_STATUS, MONEY_TRANSFER_TYPES } from './constants';
import { CollectionStatus } from '@app/admin/types/collection';
import { MarketConfig } from '@app/config';
import { CollectionToken, SellingMethod } from '@app/types';

@Injectable()
export class EscrowService {
  private readonly collectionsRepository: Repository<Collection>;
  private logger = new Logger(EscrowService.name);

  constructor(private connection: DataSource, @Inject('CONFIG') private config: MarketConfig, private moduleRef: ModuleRef) {
    this.collectionsRepository = connection.getRepository(Collection);
  }

  /**
   * Get network name from config
   * @param {String} network - network name
   * @returns {String} network name
   */
  getNetwork(network?: string): string {
    if (!network) return this.config.blockchain.unique.network;
    return network;
  }

  /**
   * Get a block from the database and compare it with the current block, we get the estimated time of the next block
   * @param {BigInt | Number} blockNum - number block
   * @param {String} network - network name
   * @param {BigInt} blockTimeSec
   * @return ({}Promise<Date>})
   */
  async getBlockCreatedAt(blockNum: bigint | number, network?: string, blockTimeSec = 6n): Promise<Date> {
    const repository = this.connection.getRepository(BlockchainBlock);
    let block = await repository.findOne({ where: { block_number: `${blockNum}`, network: this.getNetwork(network) } });
    if (!!block) return block.created_at;
    block = await repository
      .createQueryBuilder('blockchain_block')
      .orderBy('block_number', 'DESC')
      .where('blockchain_block.network = :network AND blockchain_block.block_number < :num', {
        network: this.getNetwork(network),
        num: blockNum,
      })
      .limit(1)
      .getOne();
    if (!!block) {
      const difference = BigInt(blockNum) - BigInt(block.block_number);
      return new Date(block.created_at.getTime() + Number(difference * 1000n * blockTimeSec)); // predict time for next block
    }
    return new Date();
  }

  /**
   * Checking if a block is in the database
   * @description The record block in the database, together with the network and the date of the record, is the scanned block of the chain
   * @param blockNum
   * @param network
   */
  async isBlockScanned(blockNum: bigint | number, network?: string): Promise<boolean> {
    return !!(
      await this.connection
        .getRepository(BlockchainBlock)
        .findOne({ where: { block_number: `${blockNum}`, network: this.getNetwork(network) } })
    )?.block_number;
  }

  /**
   * Get the last scanned block from the database
   * @param network
   * №
   */
  async getLastScannedBlock(network?: string): Promise<BlockchainBlock> {
    return await this.connection
      .getRepository(BlockchainBlock)
      .createQueryBuilder('blockchain_block')
      .orderBy('block_number', 'DESC')
      .where('blockchain_block.network = :network', { network: this.getNetwork(network) })
      .limit(1)
      .getOne();
  }

  /**
   * @async
   * Register the substrate address and its ethereum address in the database
   * @description  Attention!
   * It is not possible to get the substrate address back from an ethereum address.
   * To do this, in order to then compare to which ethereum address the substrate address is equal
   * @param {String} substrate - Substrate address
   * @param {String} ethereum - Ethereum address
   * @return {Promise<void>}
   */
  async registerAccountPair(substrate: string, ethereum: string): Promise<void> {
    const repository = this.connection.getRepository(AccountPairs);
    await repository.upsert({ substrate: substrate, ethereum: ethereum.toLocaleLowerCase() }, ['substrate', 'ethereum']);
  }

  /**
   * @async
   * Getting Substrate address from Ethereum address
   * @param {String} ethereum - Ethereum address
   * @return {Promise<String>}
   */
  async getSubstrateAddress(ethereum: string): Promise<string> {
    const repository = this.connection.getRepository(AccountPairs);
    return (await repository.findOne({ where: { ethereum: ethereum.toLocaleLowerCase() } }))?.substrate;
  }

  /**
   * @async
   * Receiving an Offer by the specified collection and token number and from which network
   * @param {Number} collectionId
   * @param {Number} tokenId
   * @param {String} network
   * @return {Promise<OffersEntity>}
   */
  async getActiveAsk(collectionId: number, tokenId: number, network?: string): Promise<OffersEntity> {
    const repository = this.connection.getRepository(OffersEntity);
    return await repository.findOne({
      where: {
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        network: this.getNetwork(network),
        status: In([ASK_STATUS.ACTIVE, ASK_STATUS.REMOVED_BY_ADMIN]),
        type: SellingMethod.FixedPrice,
      },
    });
  }

  /**
   * Registering a new sale offer
   * @param {BigInt} blockNum - block number from chain
   * @param {IOfferInsertData} data - collectionId: number; tokenId: number; addressFrom: string; addressTo: string; price: number; currency: string;
   * @param {String} network - network
   * @async
   * @return {Promise<void>}
   */
  async registerAsk(blockNum: bigint | number, data: IOfferInsertData, network?: string): Promise<void> {
    const repository = this.connection.getRepository(OffersEntity);
    const dataOffers = {
      id: uuid(),
      type: SellingMethod.FixedPrice,
      block_number_ask: `${blockNum}`,
      network: this.getNetwork(network),
      collection_id: data.collectionId.toString(),
      token_id: data.tokenId.toString(),
      address_from: encodeAddress(data.addressFrom),
      address_to: data.addressTo,
      status: ASK_STATUS.ACTIVE,
      price: data.price.toString(),
      currency: data.currency,
      created_at_ask: new Date(),
      updated_at: new Date(),
    };
    await repository.insert(dataOffers);
    this.logger.log(JSON.stringify(dataOffers));
    this.logger.log(`Registered FixedPrice for token ${data.tokenId} in collection ${data.collectionId} in block ${blockNum}`);
  }

  /**
   * Record data that the token was withdrawn from sale
   * @param {Number} collectionId - collection ID
   * @param {Number} tokenId - token ID
   * @param {BigInt} blockNumber - block number of chain
   * @param {String} network - network chain
   * @async
   * @return {Promise<void>}
   */
  async cancelAsk(collectionId: number, tokenId: number, blockNumber: bigint, network?: string) {
    const repository = this.connection.getRepository(OffersEntity);
    await repository.update(
      {
        type: SellingMethod.FixedPrice,
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        status: In([ASK_STATUS.ACTIVE, ASK_STATUS.REMOVED_BY_ADMIN]),
        network: this.getNetwork(network),
      },
      { status: ASK_STATUS.CANCELLED, block_number_cancel: `${blockNumber}` },
    );
    this.logger.log(`Cancelled FixedPrice for token ${tokenId} in collection ${collectionId}`);
  }

  /**
   * Record that the specified token from the specified collection was sold
   * @param {Number} collectionId - collection ID
   * @param {Number} tokenId - token ID
   * @param {BigInt} blockNumber - block number of chain
   * @param {String} network - network chain
   * @async
   * @return Promise<void>
   */
  async buyKSM(collectionId: number, tokenId: number, blockNumber: bigint, network?: string) {
    const repository = this.connection.getRepository(OffersEntity);
    await repository.update(
      {
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        status: ASK_STATUS.ACTIVE,
        type: SellingMethod.FixedPrice,
        network: this.getNetwork(network),
      },
      { status: ASK_STATUS.BOUGHT, block_number_buy: `${blockNumber}` },
    );
    this.logger.log(`Bought KSM for token ${tokenId} in collection ${collectionId}`);
  }

  /**
   *
   * @param blockNum
   * @param data
   * @param network
   */
  async registerTransfer(blockNum: bigint | number, data: IRegisterTransferData, network?: string) {
    const { contractAddress } = this.config.blockchain.unique;

    const isContractTransferFrom = data.addressFrom.Ethereum?.toLowerCase() === contractAddress.toLowerCase();
    const isContractTransferTo = data.addressTo.Ethereum?.toLowerCase() === contractAddress.toLowerCase();

    const address_from = data.addressFrom.Ethereum
      ? isContractTransferFrom
        ? evmToAddress(data.addressFrom.Ethereum)
        : await this.getSubstrateAddress(data.addressFrom.Ethereum)
      : data.addressFrom.Substrate;

    const address_to = data.addressTo.Ethereum
      ? isContractTransferTo
        ? evmToAddress(data.addressTo.Ethereum)
        : await this.getSubstrateAddress(data.addressTo.Ethereum)
      : data.addressTo.Substrate;

    if (!address_from || !address_to || address_from === address_to) return;

    const repository = this.connection.getRepository(NFTTransfer);

    // TODO: change scanBlock -> e.toHuman() -> e.JSON() and refactoring escrow service
    const collection_id = data.collectionId.toString().replace(/,/g, '');
    const token_id = data.tokenId.toString().replace(/,/g, '');

    const item = {
      id: uuid(),
      block_number: `${blockNum}`,
      network: this.getNetwork(network),
      collection_id,
      token_id,
      address_from,
      address_to,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await repository.insert({
      ...item,
    });

    this.logger.log(
      JSON.stringify({
        subject: 'Got NFT transfer',
        ...item,
      }),
    );
  }

  /**
   *
   * @param collectionId
   * @param tokenId
   * @param network
   */
  async getTokenTransfers(collectionId: number, tokenId: number, network: string) {
    const repository = this.connection.getRepository(NFTTransfer);
    return repository.find({
      where: {
        network: this.getNetwork(network),
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
      },
    });
  }

  /**
   *
   * @param blockNum
   * @param timestamp
   * @param network
   */
  async addBlock(blockNum: bigint | number, timestamp: number, network?: string) {
    const repository = this.connection.getRepository(BlockchainBlock);
    const created_at = new Date(timestamp);
    await repository.upsert({ block_number: `${blockNum}`, network: this.getNetwork(network), created_at }, ['block_number', 'network']);
  }

  /**
   *
   * @param amount
   * @param address
   * @param blockNumber
   * @param network
   */
  async modifyContractBalance(amount, address, blockNumber, network: string): Promise<MoneyTransfer> {
    const repository = this.connection.getRepository(MoneyTransfer);
    const transfer = repository.create({
      id: uuid(),
      amount,
      block_number: blockNumber,
      network,
      type: MONEY_TRANSFER_TYPES.DEPOSIT,
      status: MONEY_TRANSFER_STATUS.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
      extra: { address },
      currency: '2', // TODO: check this
    });
    await repository.save(transfer);
    this.logger.log(`Added contract balance ${amount} to ${address}`);
    return transfer;
  }

  /**
   *
   * @param amount
   * @param address
   * @param blockNumber
   * @param network
   */
  async registerKusamaWithdraw(amount, address, blockNumber, network) {
    const repository = this.connection.getRepository(MoneyTransfer);
    await repository.insert({
      id: uuid(),
      amount,
      block_number: blockNumber,
      network,
      type: MONEY_TRANSFER_TYPES.WITHDRAW,
      status: MONEY_TRANSFER_STATUS.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
      extra: { address },
      currency: '2', // TODO: check this
    });
    this.logger.log(
      `{ subject:'Transfer money Kusama', thread: 'withdraw', amount: ${amount}, address: '${address}', address_normal: '${encodeAddress(
        address,
      )}', status: 'PENDING', block: ${blockNumber} , log: 'registerKusamaWithdraw'}`,
    );
  }

  /**
   *
   * @param network
   */
  async getPendingContractBalance(network: string) {
    return this.connection
      .getRepository(MoneyTransfer)
      .createQueryBuilder('money_transfer')
      .orderBy('created_at', 'ASC')
      .where('(money_transfer.network = :network AND money_transfer.type = :type AND money_transfer.status = :status)', {
        network,
        type: MONEY_TRANSFER_TYPES.DEPOSIT,
        status: MONEY_TRANSFER_STATUS.PENDING,
      })
      .limit(1)
      .getOne();
  }

  /**
   *
   * @param network
   */
  async getPendingKusamaWithdraw(network: string) {
    return this.connection
      .getRepository(MoneyTransfer)
      .createQueryBuilder('money_transfer')
      .orderBy('created_at', 'ASC')
      .where('(money_transfer.network = :network AND money_transfer.type = :type AND money_transfer.status = :status)', {
        network,
        type: MONEY_TRANSFER_TYPES.WITHDRAW,
        status: MONEY_TRANSFER_STATUS.PENDING,
      })
      .limit(1)
      .getOne();
  }

  /**
   *
   * @param id
   * @param status
   */
  async updateMoneyTransferStatus(id, status: string) {
    await this.connection.getRepository(MoneyTransfer).update({ id }, { status, updated_at: new Date() });
    this.logger.log(`Transfer status update ${status} in ${id}`);
  }

  /**
   *
   * @param buyer
   * @param seller
   * @param price
   */
  async getTradeSellerAndBuyer(buyer: string, seller: string, price: string): Promise<MarketTrade> {
    const repository = this.connection.getRepository(MarketTrade);
    return await repository.findOne({
      where: {
        address_seller: seller,
        address_buyer: buyer,
        price: price,
      },
    });
  }

  /**
   *
   * @param buyer
   * @param price
   * @param ask
   * @param blockNum
   * @param originPrice
   * @param network
   */
  async registerTrade(buyer: string, price: bigint, ask: OffersEntity, blockNum: bigint, originPrice: bigint, network?: string) {
    const repository = this.connection.getRepository(MarketTrade);
    await repository.insert({
      id: uuid(),
      collection_id: ask.collection_id,
      token_id: ask.token_id,
      network: this.getNetwork(network),
      price: `${price}`,
      currency: ask.currency,
      address_seller: encodeAddress(ask.address_from),
      address_buyer: encodeAddress(buyer),
      block_number_ask: ask.block_number_ask,
      block_number_buy: `${blockNum}`,
      ask_created_at: await this.getBlockCreatedAt(BigInt(ask.block_number_ask), network),
      buy_created_at: await this.getBlockCreatedAt(blockNum, network),
      status: SellingMethod.FixedPrice,
      originPrice: `${originPrice}`,
      commission: `${originPrice - price}`,
    });
    this.logger.log(
      `{ subject:'Register trade', buyer: '${buyer}', seller: '${ask.address_from}', price: ${price}, block: ${blockNum}, log: 'registerTrade' }`,
    );

    await this.buyKSM(parseInt(ask.collection_id), parseInt(ask.token_id), blockNum, network);
  }

  /**
   *
   * @param collectionId
   * @param tokenId
   * @param network
   */
  async getSearchIndexTraits(collectionId: number, tokenId: number, network?: string) {
    const repository = this.connection.getRepository(SearchIndex);
    return await repository.find({
      where: {
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
        network: this.getNetwork(network),
        is_trait: true,
      },
    });
  }

  /**
   * Get token search index
   *
   * @async
   * @param {CollectionToken} token
   * @returns {Promise<SearchIndex[]>}
   */
  async addSearchIndexes(token: CollectionToken): Promise<SearchIndex[]> {
    const searchIndex = this.moduleRef.get(SearchIndexService, { strict: false });
    return searchIndex.addSearchIndexIfNotExists(token);
  }

  /**
   * Get enabled collections ids from database
   * @return ({Promise<number[]>})
   */
  async getCollectionIds(): Promise<number[]> {
    const collections = await this.collectionsRepository.find({ where: { status: CollectionStatus.Enabled } });

    return collections.map((i) => Number(i.id));
  }

  /**
   *
   * @param id
   * @param data
   */
  async setCollectionIds(id: string, data: any) {
    const entity = this.collectionsRepository.create({ id: id, ...data });
    await this.collectionsRepository.save(entity);
    logging.log(`Adding #${id} to collection table`);
  }
}
