import { INestApplication } from '@nestjs/common';
import { initApp } from './data';
import { ApiPromise } from '@polkadot/api';
import { HelperService } from '@app/helpers/helper.service';
import { TestContractManager } from './utils/test.contract-manager';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { SdkProvider } from '@app/uniquesdk';
import { MarketConfig } from '@app/config';
import { KusamaEscrow, UniqueEscrow } from '@app/escrow';
import { EscrowService } from '@app/escrow/service';
import { Escrow } from '@app/escrow/base';
import { TestCollectionManager } from './utils/test.collection-manager';

describe('Escrow with SDK Test', () => {
  jest.setTimeout(60 * 60 * 1000);

  let app: INestApplication;
  let api: ApiPromise;
  let config: MarketConfig;
  let helpService: HelperService;
  let serviceEscrow: EscrowService;
  let uniqueProvider: SdkProvider;
  let kusamaProvider: SdkProvider;
  let web3conn, web3;

  const KYC_PRICE = 1_000n;

  beforeAll(async () => {
    app = await initApp();
    config = app.get('CONFIG');
    serviceEscrow = app.get(EscrowService);
    web3conn = app.get(Web3Service);
    uniqueProvider = app.get<SdkProvider>('UNIQUE_SDK_PROVIDER');
    kusamaProvider = app.get<SdkProvider>('KUSAMA_SDK_PROVIDER');
    api = uniqueProvider.api;
    helpService = app.get(HelperService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Deploy contract', async () => {
    const testContractManager = new TestContractManager(app);
    await testContractManager.init();
  });
  it('Escrow Init', async () => {
    const escrow = new UniqueEscrow(config, serviceEscrow, uniqueProvider.sdk, web3conn, UniqueEscrow.MODE_PROD);
    await escrow.init();
    expect(escrow.api.isReady).toBeTruthy();
  });

  it('Collection init', async () => {
    const createCollection = new TestCollectionManager(app);
    console.log('createCollection', createCollection);
    expect(true).toBeTruthy();
  });
});
