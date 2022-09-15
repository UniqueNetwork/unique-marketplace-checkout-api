import * as fs from 'fs';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { IKeyringPair } from '@polkadot/types/types';
import { ApiPromise } from '@polkadot/api';
import { Connection } from 'typeorm';

import * as lib from '../src/utils/blockchain/web3';
import * as unique from '../src/utils/blockchain/unique';
import * as util from '../src/utils/blockchain/util';
import { UniqueExplorer, convertAddress } from '../src/utils/blockchain/util';
import { initApp, runMigrations } from './data';
import { EscrowService } from '../src/escrow/service';
import { UniqueEscrow } from '../src/escrow';
import { MONEY_TRANSFER_STATUS } from '../src/escrow/constants';
import { ConstDataPlayload, TraitsSchema } from './data/escrow.data';
import { encodeData } from '../src/utils/blockchain/token';
import { signTransaction } from '../src/utils/blockchain';
import { CollectionsService } from '../src/admin/services/collections.service';
import { CollectionImportType } from '../src/admin/types';
import { UNIQUE_API_PROVIDER, KUSAMA_API_PROVIDER } from '../src/blockchain';

describe('Escrow test', () => {
  jest.setTimeout(60 * 60 * 1000);

  let app: INestApplication;
  let api: ApiPromise;
  let web3conn, web3;
  const cacheDir = path.join(__dirname, 'cache');
  const KYC_PRICE = 1_000n;

  beforeAll(async () => {
    app = await initApp();
    const config = app.get('CONFIG');
    await runMigrations(config);
    await app.init();
    web3conn = lib.connectWeb3(config.blockchain.testing.unique.wsEndpoint);
    api = await unique.connectApi(config.blockchain.testing.unique.wsEndpoint, false);
    web3 = web3conn.web3;
  });

  afterAll(async () => {
    await app.close();
    web3conn.provider.connection.close();
    await api.disconnect();

    await app.get<Connection>('DATABASE_CONNECTION').close();
    await app.get<ApiPromise>(KUSAMA_API_PROVIDER).disconnect();
    await app.get<ApiPromise>(UNIQUE_API_PROVIDER).disconnect();
  });

  const clearCache = () => {
    for (const file of ['contract.json', 'collection.json']) {
      if (fs.existsSync(path.join(cacheDir, file))) fs.unlinkSync(path.join(cacheDir, file));
    }
  };

  const deployContract = async (config, admin: IKeyringPair) => {
    const cachedPath = path.join(cacheDir, 'contract.json');
    let cachedData: { contractAddress: string; contractOwnerSeed: string } = null;
    const readBCStatic = (filename) => fs.readFileSync(path.join(config.rootDir, '..', 'blockchain', filename)).toString();
    if (fs.existsSync(cachedPath)) {
      cachedData = JSON.parse(fs.readFileSync(cachedPath).toString());
      const balance = (await api.rpc.eth.getBalance(cachedData.contractAddress)).toBigInt();
      if (balance < 50n * lib.UNIQUE) {
        // balance to low
        clearCache();
        cachedData = null;
      }
    }
    if (cachedData !== null) {
      const contractOwner = web3.eth.accounts.privateKeyToAccount(cachedData.contractOwnerSeed);
      web3.eth.accounts.wallet.add(contractOwner.privateKey);
      const contract = new web3.eth.Contract(JSON.parse(readBCStatic('MarketPlace.abi')), cachedData.contractAddress);
      return { contract, contractOwner, helpers: lib.contractHelpers(web3, contractOwner.address) };
    }

    const contractOwner = await lib.createEthAccountWithBalance(api, web3);
    const contractAbi = new web3.eth.Contract(JSON.parse(readBCStatic('MarketPlace.abi')), undefined, {
      from: contractOwner.address,
      ...lib.GAS_ARGS,
    });
    const contract = await contractAbi
      .deploy({ data: readBCStatic('MarketPlace.bin') })
      .send({ from: contractOwner.address, gas: 10000000 });
    await contract.methods.setEscrow(contractOwner.address, true).send({ from: contractOwner.address });
    const helpers = lib.contractHelpers(web3, contractOwner.address);

    await helpers.methods.setSponsoringMode(contract.options.address, lib.SponsoringMode.Allowlisted).send({ from: contractOwner.address });
    expect((await api.query.evmContractHelpers.sponsoringMode(contract.options.address)).toJSON()).toBe('Allowlisted');

    await helpers.methods.setSponsoringRateLimit(contract.options.address, 0).send({ from: contractOwner.address });
    expect((await api.query.evmContractHelpers.sponsoringRateLimit(contract.options.address)).toJSON()).toBe(0);

    await lib.transferBalanceToEth(api, admin, contract.options.address);

    fs.writeFileSync(
      cachedPath,
      JSON.stringify({
        contractOwnerSeed: contractOwner.privateKey,
        contractAddress: contract.options.address,
      }),
    );

    return { contractOwner, contract, helpers };
  };

  const createCollection = async (explorer: UniqueExplorer, admin: IKeyringPair, contractOwner: string) => {
    const TOKEN_PREFIX = 'test';
    const collectionsService = app.get(CollectionsService, { strict: false });

    const totalCollections = parseInt((await api.query.common.createdCollectionCount()).toHuman() as string);

    const collections = await Promise.all(
      Array.from({ length: totalCollections }, (_, i) => i + 1).map(async (collectionId) => {
        const collection = (await api.query.common.collectionById(collectionId)).toHuman() as any | null;
        return {
          collectionId,
          ...collection,
        };
      }),
    );

    const quartzAdminAdress = await convertAddress(admin.address, 255);

    const collectionsOwnerData = collections
      .filter((collectionData) => collectionData !== null)
      .filter((collectionData) => collectionData?.owner === quartzAdminAdress)
      .filter((collectionData) => collectionData?.tokenPrefix === TOKEN_PREFIX);

    let collectionId = collectionsOwnerData.length ? collectionsOwnerData[0].collectionId : null;

    if (collectionId === null) {
      collectionId = await explorer.createCollection({
        name: 'test',
        description: 'test collection',
        tokenPrefix: 'test',
      });
      await signTransaction(
        admin,
        api.tx.unique.setCollectionLimits(collectionId, { sponsorApproveTimeout: 1 }),
        'api.tx.unique.setCollectionLimits',
      ); // TODO: change createCollectionEx
      await signTransaction(admin, api.tx.unique.setCollectionSponsor(collectionId, admin.address), 'api.tx.unique.setCollectionSponsor'); // TODO: change createCollectionEx
      //await lib.transferBalanceToEth(api, admin, lib.subToEth(admin.address));
      await signTransaction(admin, api.tx.unique.confirmSponsorship(collectionId), 'api.tx.unique.confirmSponsorship');
      await signTransaction(
        admin,
        api.tx.unique.setConstOnChainSchema(collectionId, JSON.stringify(TraitsSchema)),
        'api.tx.unique.setConstOnChainSchema',
      ); // TODO: change createCollectionEx
    }

    await collectionsService.importById(collectionId, CollectionImportType.Api);

    return { collectionId, evmCollection: lib.createEvmCollection(collectionId, contractOwner, web3) };
  };

  const getEscrow = async (config) => {
    const service = app.get(EscrowService, { strict: false });
    const escrow = new UniqueEscrow(config, service, UniqueEscrow.MODE_TESTING);
    await escrow.init();

    const blocks = {
      start: 0,
      latest: (await api.rpc.chain.getHeader()).number.toNumber(),
      async updateLatest() {
        this.start = this.latest;
        this.latest = (await api.rpc.chain.getHeader()).number.toNumber();
      },
    };

    const workEscrow = async (fromBlock: number, toBlock: number) => {
      for (let block = fromBlock; block <= toBlock; block++) {
        await escrow.processBlock(block);
      }
    };

    return { escrow, workEscrow, blocks, service };
  };

  const init = async () => {
    const config = app.get('CONFIG');
    const alice = util.privateKey(config.blockchain.testing.escrowSeed);
    const explorer = new UniqueExplorer(api, alice);

    const { contract, contractOwner } = await deployContract(config, alice);

    const { collectionId, evmCollection } = await createCollection(explorer, alice, contractOwner.address);

    config.blockchain.testing.unique = {
      ...config.blockchain.testing.unique,
      contractOwnerSeed: contractOwner.privateKey,
      contractAddress: contract.options.address,
      collectionIds: [collectionId],
    };
    config.blockchain.testing.kusama.marketCommission = 10;

    const { service, workEscrow, blocks, escrow } = await getEscrow(config);

    return {
      config,
      alice,
      explorer,
      contract,
      contractOwner,
      collectionId,
      evmCollection,
      service,
      workEscrow,
      blocks,
      escrow,
    };
  };

  const addAsk = async (
    tokenId,
    price,
    seller,
    state: { evmCollection; contract; explorer; collectionId; blocks; workEscrow; config; service },
  ) => {
    // Give contract permissions to manipulate token
    let res = await lib.executeEthTxOnSub(web3, api, seller, state.evmCollection, (m) =>
      m.approve(state.contract.options.address, tokenId),
    );
    expect(res.success).toBe(true);
    // Add ask to contract
    res = await lib.executeEthTxOnSub(web3, api, seller, state.contract, (m) =>
      m.addAsk(price, '0x0000000000000000000000000000000000000001', state.evmCollection.options.address, tokenId),
    );
    expect(res.success).toBe(true);

    // Token is transferred to matcher
    expect(util.normalizeAccountId(await state.explorer.getTokenOwner(state.collectionId, tokenId))).toEqual({
      Ethereum: state.contract.options.address.toLowerCase(),
    });

    // Escrow must create new contract_ask for this token
    await state.blocks.updateLatest();
    await state.workEscrow(state.blocks.start, state.blocks.latest);

    const activeAsk = await state.service.getActiveAsk(state.collectionId, tokenId, state.config.blockchain.testing.unique.network);
    expect(activeAsk.status).toBe('active');
  };

  const processKYC = async (user: IKeyringPair, state: { service; blocks; config; workEscrow; contract }) => {
    // KYC action (transfer to escrow, kusama escrow daemon perform this call normally)
    await state.service.modifyContractBalance(KYC_PRICE, user.address, state.blocks.latest, state.config.blockchain.testing.kusama.network);

    // Escrow must register deposit for user
    await state.blocks.updateLatest();
    await state.workEscrow(state.blocks.start, state.blocks.latest);

    // Seller must be added to contract allow list after KYC transfer
    expect((await api.query.evmContractHelpers.allowlist(state.contract.options.address, lib.subToEth(user.address))).toJSON()).toBe(true);

    expect(await state.contract.methods.balanceKSM(lib.subToEth(user.address)).call()).toEqual(KYC_PRICE.toString());

    // Escrow must set finished status for transfer
    expect(await state.service.getPendingContractBalance(state.config.blockchain.testing.kusama.network)).toBeUndefined();
  };

  const transferTokenToEVM = async (user: IKeyringPair, tokenId: number, state: { collectionId; explorer }) => {
    await signTransaction(
      user,
      api.tx.unique.transfer(util.normalizeAccountId({ Ethereum: lib.subToEth(user.address) }), state.collectionId, tokenId, 1),
      'api.tx.unique.transfer',
    );
    expect(util.normalizeAccountId(await state.explorer.getTokenOwner(state.collectionId, BigInt(tokenId)))).toEqual({
      Ethereum: lib.subToEthLowercase(user.address),
    });
  };

  it('Withdraw balance', async () => {
    const TO_WITHDRAW = 2_000_000_000n; // 2 KSM
    const { config, alice, service, workEscrow, blocks, contract, escrow } = await init();

    // No active withdraw
    let activeWithdraw = await service.getPendingKusamaWithdraw(config.blockchain.testing.kusama.network);
    expect(activeWithdraw).toBeUndefined();

    await service.modifyContractBalance(TO_WITHDRAW, alice.address, blocks.latest, config.blockchain.testing.kusama.network);

    await blocks.updateLatest();
    await workEscrow(blocks.start, blocks.latest);

    expect(await contract.methods.balanceKSM(lib.subToEth(alice.address)).call()).toEqual(TO_WITHDRAW.toString());

    await lib.executeEthTxOnSub(web3, api, alice, contract, (m) => m.withdrawAllKSM(lib.subToEth(alice.address)));

    await blocks.updateLatest();
    await workEscrow(blocks.start, blocks.latest);

    expect(await contract.methods.balanceKSM(lib.subToEth(alice.address)).call()).toEqual('0');

    // Withdraw with all balance amount
    activeWithdraw = await service.getPendingKusamaWithdraw(config.blockchain.testing.kusama.network);
    expect(activeWithdraw.extra.address).toEqual(alice.address.toString());
    expect(activeWithdraw.amount).toEqual(TO_WITHDRAW.toString());

    // Set status to completed (kusama escrow daemon perform this call normally)
    await service.updateMoneyTransferStatus(activeWithdraw.id, MONEY_TRANSFER_STATUS.COMPLETED);
    await escrow.destroy();
  });

  it('Get token traits', async () => {
    const PRICE = 2_000_000_000_000n; // 2 KSM
    const state = await init();

    const { explorer, collectionId, blocks, workEscrow, escrow, service, config } = state;

    const seller = util.privateKey(`//Seller/${Date.now()}`);

    await processKYC(seller, state);

    const createToken = await explorer.createToken({
      collectionId,
      owner: seller.address,
      constData: encodeData(JSON.stringify(TraitsSchema), ConstDataPlayload),
    });
    const tokenId = createToken.tokenId;

    await transferTokenToEVM(seller, tokenId, state);

    await addAsk(tokenId, PRICE, seller, state);

    await blocks.updateLatest();
    await workEscrow(blocks.start, blocks.latest);

    await escrow.destroy();

    const searchTraits = await service.getSearchIndexTraits(collectionId, tokenId, config.blockchain.testing.unique.network);
    expect(searchTraits.length).toBe(2);
  });

  it('Register transfer', async () => {
    const { config, explorer, collectionId, service, workEscrow, blocks, escrow, alice } = await init();
    const seller = util.privateKey(`//Seller/${Date.now()}`);
    const buyer = util.privateKey(`//Buyer/${Date.now()}`);

    // TODO check sponsoring
    // await lib.transferBalanceToEth(api, alice, lib.subToEth(buyer.address));
    await signTransaction(alice, api.tx.balances.transfer(buyer.address, 10n * lib.UNIQUE));

    const tokenId = (
      await explorer.createToken({
        collectionId,
        owner: seller.address,
        constData: encodeData(JSON.stringify(TraitsSchema), ConstDataPlayload),
      })
    ).tokenId;
    await signTransaction(
      seller,
      api.tx.unique.transfer(util.normalizeAccountId({ Substrate: buyer.address }), collectionId, tokenId, 1),
      'api.tx.unique.transfer',
    );
    expect(escrow.normalizeSubstrate(util.normalizeAccountId(await explorer.getTokenOwner(collectionId, tokenId)).Substrate)).toEqual(
      util.normalizeAccountId(buyer.address).Substrate,
    );

    const beforeTransfers = await service.getTokenTransfers(collectionId, tokenId, config.blockchain.testing.unique.network);

    expect(beforeTransfers.length).toBe(0);

    // Escrow should register substrate transfer
    await blocks.updateLatest();
    await workEscrow(blocks.start, blocks.latest);
    let afterTransfers = await service.getTokenTransfers(collectionId, tokenId, config.blockchain.testing.unique.network);

    expect(afterTransfers.length).toBe(1);
    expect(afterTransfers[0].address_from).toEqual(seller.address);
    expect(afterTransfers[0].address_to).toEqual(buyer.address);
    const notInterested = afterTransfers[0].id;

    // Escrow should register ethereum transfer
    await transferTokenToEVM(buyer, tokenId, { collectionId, explorer });
    await blocks.updateLatest();
    await workEscrow(blocks.start, blocks.latest);
    afterTransfers = await service.getTokenTransfers(collectionId, tokenId, config.blockchain.testing.unique.network);
    expect(afterTransfers.length).toBe(2);
    const transfer = afterTransfers.find((x) => x.id != notInterested);
    expect(transfer.address_from).toEqual(buyer.address);
    expect(transfer.address_to).toEqual(lib.subToEthLowercase(buyer.address));

    await escrow.destroy();
  });

  it('Cancel ask', async () => {
    const PRICE = 2_000_000_000_000n; // 2 KSM
    const state = await init();

    const { config, explorer, contract, collectionId, evmCollection, service, workEscrow, blocks, escrow } = state;

    const seller = util.privateKey(`//Seller/${Date.now()}`);

    await processKYC(seller, state);

    const cancelTokenId = (
      await explorer.createToken({
        collectionId,
        owner: seller.address,
        constData: encodeData(JSON.stringify(TraitsSchema), ConstDataPlayload),
      })
    ).tokenId;

    await transferTokenToEVM(seller, cancelTokenId, state);

    await addAsk(cancelTokenId, PRICE, seller, state);

    // Cancel ask on contract
    const res = await lib.executeEthTxOnSub(web3, api, seller, contract, (m) => m.cancelAsk(evmCollection.options.address, cancelTokenId));
    expect(res.success).toBe(true);

    // Escrow must set contract_ask status for this token to cancelled
    await blocks.updateLatest();
    await workEscrow(blocks.start, blocks.latest);

    const activeAsk = await service.getActiveAsk(collectionId, cancelTokenId, config.blockchain.testing.unique.network);
    expect(activeAsk).toBeUndefined();

    // Token is transferred back to previous owner (seller)
    expect(util.normalizeAccountId(await explorer.getTokenOwner(collectionId, cancelTokenId))).toEqual(
      util.normalizeAccountId({ Ethereum: lib.subToEth(seller.address) }),
    );

    await escrow.destroy();
  });

  it('Buy token', async () => {
    const PRICE_WITHOUT_COMISSION = 1_000_000_000_000n; // 1 KSM
    const PRICE = (PRICE_WITHOUT_COMISSION * 1100n) / 1000n; // 1.1 KSM

    const state = await init();

    const { config, explorer, contract, collectionId, evmCollection, service, workEscrow, blocks, escrow } = state;

    const seller = util.privateKey(`//Seller/${Date.now()}`);
    const buyer = util.privateKey(`//Buyer/${Date.now()}`);

    await processKYC(seller, state);

    const sellTokenId = (
      await explorer.createToken({
        collectionId,
        owner: seller.address,
        constData: encodeData(JSON.stringify(TraitsSchema), ConstDataPlayload),
      })
    ).tokenId;

    // To transfer item to matcher it first needs to be transferred to EVM account of seller
    await transferTokenToEVM(seller, sellTokenId, state);

    // Ask
    await addAsk(sellTokenId, PRICE, seller, state);

    // Give buyer KSM
    await blocks.updateLatest();
    await service.modifyContractBalance(PRICE, buyer.address, blocks.latest, config.blockchain.testing.kusama.network);

    // Escrow must register deposit for buyer
    await workEscrow(blocks.start, blocks.latest);

    // Buyer must be added to contract allow list after deposit
    expect((await api.query.evmContractHelpers.allowlist(contract.options.address, lib.subToEth(buyer.address))).toJSON()).toBe(true);

    // Buy
    {
      expect(await contract.methods.balanceKSM(lib.subToEth(seller.address)).call()).toEqual(KYC_PRICE.toString());
      expect(await contract.methods.balanceKSM(lib.subToEth(buyer.address)).call()).toEqual(PRICE.toString());

      await lib.executeEthTxOnSub(web3, api, buyer, contract, (m) =>
        m.buyKSM(evmCollection.options.address, sellTokenId, lib.subToEth(buyer.address), lib.subToEth(buyer.address)),
      );

      // Price is removed from buyer balance, and added to seller
      expect(await contract.methods.balanceKSM(lib.subToEth(buyer.address)).call()).toEqual('0');
      expect(await contract.methods.balanceKSM(lib.subToEth(seller.address)).call()).toEqual((PRICE + KYC_PRICE).toString());

      // Escrow withdraw balance from contract and send KSM to seller
      let activeWithdraw = await service.getPendingKusamaWithdraw(config.blockchain.testing.kusama.network);
      expect(activeWithdraw).toBeUndefined();
      let checkTrade = await service.getTradeSellerAndBuyer(buyer.address, seller.address, PRICE_WITHOUT_COMISSION.toString());
      expect(checkTrade).toBeUndefined();

      // Process buyKSM with escrow
      await blocks.updateLatest();
      await workEscrow(blocks.start, blocks.latest);

      // Buyer
      //expect(await contract.methods.balanceKSM(lib.subToEth(seller.address)).call()).toEqual(KYC_PRICE.toString());
      activeWithdraw = await service.getPendingKusamaWithdraw(config.blockchain.testing.kusama.network);
      expect(activeWithdraw.amount).toEqual(PRICE_WITHOUT_COMISSION.toString());

      checkTrade = await service.getTradeSellerAndBuyer(buyer.address, seller.address, PRICE_WITHOUT_COMISSION.toString());

      expect(activeWithdraw.extra.address).toEqual(seller.address.toString());
      expect(activeWithdraw.extra.address).toEqual(checkTrade.address_seller);
      expect(activeWithdraw.amount).toEqual(checkTrade.price);

      await service.updateMoneyTransferStatus(activeWithdraw.id, MONEY_TRANSFER_STATUS.COMPLETED);
    }

    // Token is transferred to evm account of buyer
    expect(util.normalizeAccountId(await explorer.getTokenOwner(collectionId, sellTokenId))).toEqual(
      util.normalizeAccountId({ Ethereum: lib.subToEthLowercase(buyer.address) }),
    );

    // Transfer token to substrate side of buyer
    await signTransaction(
      buyer,
      api.tx.unique.transferFrom(
        util.normalizeAccountId({ Ethereum: lib.subToEth(buyer.address) }),
        util.normalizeAccountId({ Substrate: buyer.address }),
        collectionId,
        sellTokenId,
        1,
      ),
      'api.tx.unique.transferFrom',
    );

    // Token is transferred to substrate account of buyer, seller received funds
    expect(escrow.normalizeSubstrate(util.normalizeAccountId(await explorer.getTokenOwner(collectionId, sellTokenId)).Substrate)).toEqual(
      util.normalizeAccountId(buyer.address).Substrate,
    );

    await escrow.destroy();
  });
});
