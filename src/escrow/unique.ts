import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { Interface } from 'ethers/lib/utils';
import InputDataDecoder from 'ethereum-input-data-decoder';

import { Escrow } from './base';
import * as logging from '@app/utils/logging';
import * as util from '../utils/blockchain/util';
import { MONEY_TRANSFER_STATUS } from './constants';
import { MoneyTransfer } from '@app/entity';
import { Logger } from '@nestjs/common';
import { Contract } from 'ethers';
import { HelperService } from '@app/helpers/helper.service';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { WEB3_GAS_ARGS } from '@app/uniquesdk';

/**
 * Unique escrow implementation.
 * @description
 * @class UniqueExplorer
 */
export class UniqueEscrow extends Escrow {
  logger = new Logger(UniqueEscrow.name);
  helperService = new HelperService();
  inputDecoder;
  etherDecoder;
  explorer;
  web3conn: Web3Service;
  web3;
  contractOwner;
  SECTION_UNIQUE = 'unique';
  SECTION_CONTRACT = 'evm';
  SECTION_ETHEREUM = 'ethereum';
  collectionIds: number[];

  BLOCKED_SCHEMA_KEYS = ['ipfsJson'];

  /**
   * Convert Substrate address to Normalized address 42
   * @param address - Substrate address
   * @returns {string}
   */
  normalizeSubstrate(address: string): string {
    return encodeAddress(decodeAddress(address));
  }

  /**
   * Convert Ethereum address or Substrate address to string
   * @param address - Ethereum address or Substrate address
   * @returns {string}
   */
  address2string(address): string {
    if (typeof address === 'string') return address;
    if (address.Ethereum) return address.Ethereum;
    if (address.ethereum) return address.ethereum;
    if (address.Substrate) return address.Substrate;
    if (address.substrate) return address.substrate;
    throw Error('Invalid address');
  }

  /**
   * Initialize escrow.
   * @returns {Promise<void>}
   */
  async init() {
    this.initialized = true;
    await this.connectApi();
    this.inputDecoder = new InputDataDecoder(this.getAbi());
    this.etherDecoder = new Interface(this.getAbi());
    this.explorer = new util.UniqueExplorer(this.api, this.admin, this.helperService);
    this.web3 = this.web3conn.web3;
    this.contractOwner = this.web3.eth.accounts.privateKeyToAccount(this.config('unique.contractOwnerSeed'));
  }

  /**
   * Destroy connection chainWSConnection for escrow.
   * @returns {Promise<void>}
   */
  async destroy() {
    if (!this.initialized) return;
    this.web3conn.disconnect();
    await this.api.disconnect();
  }

  /**
   * Get ABI of contract.
   * @returns {string}
   */
  getAbi() {
    return JSON.parse(this.helperService.marketABIStaticFile('MarketPlace.abi'));
  }

  /**
   * Create new connection to chain. Add the contractOwner address to the contract wallet.
   * At the output, we get a web3 connector to the contract and contractHelpers to access the contract.
   * @param func
   */
  async withContract(func: any): Promise<any> {
    const web3 = this.web3conn.web3;
    web3.eth.accounts.wallet.add(this.contractOwner.privateKey);
    await func(
      web3,
      new web3.eth.Contract(this.getAbi(), this.config('unique.contractAddress')),
      this.web3conn.contractHelpers(web3, this.contractOwner.address),
    );
  }

  /**
   * Add allowed list in to contract.
   * @param substrateAddress
   * @param contract
   * @param helpers
   */
  async addToAllowList(substrateAddress: string, contract: Contract, helpers: Contract): Promise<any> {
    const contractAddress = this.config('unique.contractAddress');
    const ethAddress = this.web3conn.subToEth(substrateAddress),
      toAdd = [];
    // let toCheck = [substrateAddress, ethAddress, evmToAddress(ethAddress, 42, 'blake2')];
    const toCheck = [ethAddress];
    for (const address of toCheck) {
      const isAllowed = (await this.api.query.evmContractHelpers.allowlist(contractAddress, address)).toJSON();
      if (!isAllowed) toAdd.push(address);
    }
    if (!toAdd.length) return;

    for (const address of toAdd) {
      await helpers.methods.toggleAllowed(contract.options.address, address, true).send({ from: this.contractOwner.address });
    }
  }

  /**
   * Check if the collection contains the specified collection number
   * @param {String} collectionId
   * @returns {boolean}
   */
  isCollectionManaged(collectionId: number): boolean {
    return this.collectionIds.indexOf(collectionId) !== -1;
  }

  /**
   * Get price without commission.
   * @param {BigInt} price
   * @returns {BigInt}
   */

  getPriceWithoutCommission(price: bigint) {
    return (price * (100n - BigInt(parseInt(this.config('kusama.marketCommission'))))) / 100n;
  }

  /**
   * Get the api and escrow admin account.
   * @returns {Promise<any>}
   */
  async connectApi(): Promise<any> {
    //this.api = await unique.connectApi(this.config('unique.wsEndpoint'), this.configMode === Escrow.MODE_PROD);

    this.admin = this.helperService.privateKey(this.config('escrowSeed'));
  }

  async processTransfer(blockNum, events) {
    const eventTransfer = events.find((e) => e.event.method === 'Transfer' && e.event.section === 'common');
    if (!eventTransfer) return;
    const collectionId = parseInt(eventTransfer.event.data[0].replace(/,/g, ''));
    if (!this.isCollectionManaged(collectionId)) return; // Collection not managed by market
    await this.service.registerTransfer(
      blockNum,
      {
        collectionId: eventTransfer.event.data[0],
        tokenId: eventTransfer.event.data[1],
        addressFrom: eventTransfer.event.data[2],
        addressTo: eventTransfer.event.data[3],
      },
      this.getNetwork(),
    );
  }

  async processAddAsk(blockNum, extrinsic, inputData, signer) {
    const addressTo = this.helperService.normalizeAccountId(extrinsic.args.target);
    const addressFrom = this.normalizeSubstrate(signer.toString()); // signer is substrate address of args.source
    const addressFromEth = this.helperService.normalizeAccountId(extrinsic.args.source);
    const price = inputData.inputs[0].toString();
    const currency = inputData.inputs[1];
    const collectionEVMAddress = inputData.inputs[2];
    const collectionId = this.helperService.extractCollectionIdFromAddress(collectionEVMAddress);
    const tokenId = inputData.inputs[3].toNumber();
    if (!this.isCollectionManaged(collectionId)) return; // Collection not managed by market
    const activeAsk = await this.service.getActiveAsk(collectionId, tokenId, this.getNetwork());
    if (activeAsk) {
      logging.log(
        `Got duplicate ask (collectionId: ${collectionId}, tokenId: ${tokenId}, price: ${price}) in block #${blockNum})`,
        logging.level.WARNING,
      );
      logging.log(`Changed status to cancelled for old ask #${activeAsk.id}`, logging.level.WARNING);
      await this.service.cancelAsk(collectionId, tokenId, blockNum, this.getNetwork());
    }
    await this.service.registerAccountPair(addressFrom, this.address2string(addressFromEth));
    const isToContract = this.address2string(addressTo).toLocaleLowerCase() === this.config('unique.contractAddress').toLocaleLowerCase();
    if (!isToContract) return;
    logging.log(`Got ask (collectionId: ${collectionId}, tokenId: ${tokenId}, price: ${price}) in block #${blockNum}`);

    await this.service.addSearchIndexes({
      collectionId,
      tokenId,
      network: this.getNetwork(),
    });

    await this.service.registerAsk(
      blockNum,
      {
        collectionId,
        tokenId,
        addressTo: this.address2string(addressTo),
        addressFrom,
        price,
        currency,
      },
      this.getNetwork(),
    );
  }

  async processBuyKSM(blockNum, extrinsic, inputData) {
    // const addressTo = util.normalizeAccountId(extrinsic.args.target);
    // const addressFrom = util.normalizeAccountId(extrinsic.args.source);
    const collectionEVMAddress = inputData.inputs[0];
    const collectionId = this.helperService.extractCollectionIdFromAddress(collectionEVMAddress);
    const tokenId = inputData.inputs[1].toNumber();
    const buyer = this.helperService.normalizeAccountId(inputData.inputs[2]);
    // const receiver = util.normalizeAccountId(inputData.inputs[3]);
    const activeAsk = await this.service.getActiveAsk(collectionId, tokenId, this.getNetwork());

    if (!activeAsk) return;
    const realPrice = BigInt(activeAsk.price);
    const origPrice = this.getPriceWithoutCommission(realPrice);
    const buyerEth = this.address2string(buyer);
    const buyerSub = await this.service.getSubstrateAddress(buyerEth);
    if (!buyerSub) {
      logging.log(`No substrate address pair for ${buyerEth} eth address`, logging.level.WARNING);
    }
    const buyerAddress = buyerSub ? buyerSub : buyerEth;

    await this.service.registerTrade(buyerAddress, origPrice, activeAsk, blockNum, realPrice, this.getNetwork());

    // Balance on smart-contract (Process now, instead of next-tick)
    const transfer = await this.service.modifyContractBalance(-realPrice, activeAsk.address_from, blockNum, this.config('kusama.network'));
    await this.modifyBalanceOnContract(transfer);
    // Real KSM (Processed on kusama escrow)
    await this.service.registerKusamaWithdraw(origPrice, activeAsk.address_from, blockNum, this.config('kusama.network'));

    logging.log(
      `Got buyKSM (collectionId: ${collectionId}, tokenId: ${tokenId}, buyer: ${buyerAddress}, price: ${activeAsk.price}, price without commission: ${origPrice}) in block #${blockNum}`,
    );
  }

  async processCancelAsk(blockNum, inputData) {
    const collectionEVMAddress = inputData.inputs[0];
    const collectionId = this.helperService.extractCollectionIdFromAddress(collectionEVMAddress);
    if (!this.isCollectionManaged(collectionId)) return; // Collection not managed by market
    const tokenId = inputData.inputs[1].toNumber();
    const activeAsk = await this.service.getActiveAsk(collectionId, tokenId, this.getNetwork());
    logging.log(`Got cancelAsk (collectionId: ${collectionId}, tokenId: ${tokenId}) in block #${blockNum}`);
    if (!activeAsk) {
      logging.log(`No active offer for token ${tokenId} from collection ${collectionId}, nothing to cancel`, logging.level.WARNING);
    } else {
      await this.service.cancelAsk(collectionId, tokenId, blockNum, this.getNetwork());
    }
  }

  async processWithdrawAllKSM(blockNum: number, extrinsic, events, singer) {
    const isToContract =
      this.address2string(extrinsic.args.target).toLocaleLowerCase() === this.config('unique.contractAddress').toLocaleLowerCase();
    if (!isToContract) return; // Not our contract
    const eventLogEVM = events.find((e) => e.event.method === 'Log' && e.event.section === 'evm'); // TODO: check this
    if (!eventLogEVM) {
      logging.log(`Failed WithdrawAllKSM for ${singer} in block #${blockNum}`, logging.level.WARNING);
      return;
    }
    let withDrawData;
    try {
      withDrawData = this.etherDecoder.decodeEventLog('WithdrawnKSM', eventLogEVM.event.data[0].data);
    } catch (e) {
      logging.log(`Failed to decode WithdrawnKSM event for ${singer} in block #${blockNum}`, logging.level.ERROR);
      logging.log(e, logging.level.ERROR);
      return;
    }
    const sender = withDrawData._sender;
    const balance = withDrawData.balance.toBigInt();
    let substrateAddress = await this.service.getSubstrateAddress(sender);
    if (!substrateAddress) {
      logging.log(`No substrate address pair for ${sender} eth address`, logging.level.WARNING);
    }
    substrateAddress = substrateAddress ? substrateAddress : singer.toString();
    await this.service.registerKusamaWithdraw(balance, substrateAddress, blockNum, this.config('kusama.network'));
    logging.log(`Got WithdrawAllKSM (Sender: ${sender}, amount: ${balance}) in block #${blockNum}`);
    this.logger.log(
      `{subject: 'Got withdrawAllKSM',thread:'withdraw', amount: ${balance}, block: ${blockNum}, sender: ${sender}, address: ${substrateAddress}, log:'unique.processWithdrawAllKSM'}`,
    );
  }

  async processCall(blockNum, rawExtrinsic, events) {
    const extrinsic = rawExtrinsic.toHuman().method;
    const inputData = this.inputDecoder.decodeData(extrinsic.args.input);
    const isFailed = events.find((e) => e.event.method == 'ExecutedFailed' && e.event.section === 'evm');
    if (isFailed) {
      logging.log(`evm call failed (Method: ${inputData.method}, sender: ${rawExtrinsic.signer})`, logging.level.WARNING);
      return;
    }
    if (inputData.method === 'addAsk') {
      return await this.processAddAsk(blockNum, extrinsic, inputData, rawExtrinsic.signer);
    }
    if (inputData.method === 'buyKSM') {
      return await this.processBuyKSM(blockNum, extrinsic, inputData);
    }
    if (inputData.method === 'cancelAsk') {
      return await this.processCancelAsk(blockNum, inputData);
    }
    if (inputData.method === 'withdrawAllKSM') {
      return await this.processWithdrawAllKSM(blockNum, extrinsic, events, rawExtrinsic.signer);
    }
  }

  async processEthereum(blockNum, rawExtrinsic) {
    const extrinsic = rawExtrinsic.toHuman().method;
    if (!('transaction' in extrinsic.args)) return;
    const inputData = this.inputDecoder.decodeData(extrinsic.args.transaction.input);
    if (inputData.method === 'depositKSM') {
      const amount = inputData.inputs[0].toString();
      const sender = this.helperService.normalizeAccountId(inputData.inputs[1]);
      logging.log(`Got depositKSM (Sender: ${this.address2string(sender)}, amount: ${amount}) in block #${blockNum}`);
    }
  }

  getNetwork(): string {
    return this.config('unique.network');
  }

  async extractBlockData(blockNum, isSuccess, rawExtrinsic, events) {
    if (!isSuccess) return;

    if (['parachainSystem'].indexOf(rawExtrinsic.method.section) > -1) return;
    if (this.configObj.dev.debugScanBlock && rawExtrinsic.method.section != 'timestamp')
      logging.log([blockNum, rawExtrinsic.method.section, rawExtrinsic.method.method]);

    if (rawExtrinsic.method.section === this.SECTION_UNIQUE && rawExtrinsic.method.method === 'transfer') {
      await this.processTransfer(blockNum, events);
      return;
    }
    if (rawExtrinsic.method.section === this.SECTION_CONTRACT && rawExtrinsic.method.method === 'call') {
      await this.processCall(blockNum, rawExtrinsic, events);
      await this.processTransfer(blockNum, events);
      return;
    }
    if (rawExtrinsic.method.section === this.SECTION_ETHEREUM && rawExtrinsic.method.method === 'transact') {
      await this.processEthereum(blockNum, rawExtrinsic);
    }
  }

  async modifyBalanceOnContract(deposit: MoneyTransfer) {
    await this.service.updateMoneyTransferStatus(deposit.id, MONEY_TRANSFER_STATUS.IN_PROGRESS);
    let method = 'depositKSM';
    try {
      logging.log(`Unique deposit for money transfer #${deposit.id} started`);
      const amount = BigInt(deposit.amount);
      const ethAddress = this.web3conn.subToEth(deposit.extra.address);
      await this.service.registerAccountPair(deposit.extra.address, ethAddress);
      logging.log(['amount', amount.toString(), 'ethAddress', ethAddress]);

      await this.withContract(async (web3, contract, helpers) => {
        await this.addToAllowList(deposit.extra.address, contract, helpers);
        if (amount < 0) {
          method = 'withdrawKSM';
          await contract.methods.withdrawKSM(-amount, ethAddress).send({
            from: this.contractOwner.address,
            ...WEB3_GAS_ARGS,
          });
        } else {
          await contract.methods.depositKSM(amount, ethAddress).send({
            from: this.contractOwner.address,
            ...WEB3_GAS_ARGS,
          });
        }
      });

      await this.service.updateMoneyTransferStatus(deposit.id, MONEY_TRANSFER_STATUS.COMPLETED);
      logging.log(`Unique ${method} for money transfer #${deposit.id} successful`);
    } catch (e) {
      await this.service.updateMoneyTransferStatus(deposit.id, MONEY_TRANSFER_STATUS.FAILED);
      logging.log(`Unique ${method} for money transfer #${deposit.id} failed`, logging.level.ERROR);
      logging.log(e, logging.level.ERROR);
    }
  }

  async processContractBalance() {
    while (true) {
      const deposit = await this.service.getPendingContractBalance(this.config('kusama.network'));
      if (!deposit) break;
      await this.modifyBalanceOnContract(deposit);
    }
  }

  async processBlock(blockNum, force = false) {
    try {
      await this.scanBlock(blockNum, force);
    } catch (e) {
      logging.log(`Unable to scan block #${blockNum} (WTF?)`, logging.level.ERROR);
      logging.log(e, logging.level.ERROR);
    }
    await this.processContractBalance();
  }

  getStartFromBlock(): number | string {
    return this.config('unique.startFromBlock');
  }

  async work() {
    if (!this.initialized) throw Error('Unable to start uninitialized escrow. Call "await escrow.init()" before work');
    this.store.currentBlock = await this.getStartBlock();
    this.store.latestBlock = await this.getLatestBlockNumber();
    logging.log(
      `Unique escrow starting from block #${this.store.currentBlock} (mode: ${this.config('unique.startFromBlock')}, maxBlock: ${
        this.store.latestBlock
      })`,
    );
    logging.log(`Unique escrow contract owner address: ${this.contractOwner.address}`);
    logging.log(`Unique escrow contract address: ${this.config('unique.contractAddress')}`);
    await this.subscribe();
    await this.mainLoop();
  }

  async beforeBlockScan(): Promise<void> {
    this.collectionIds = await this.service.getCollectionIds();
  }
}
