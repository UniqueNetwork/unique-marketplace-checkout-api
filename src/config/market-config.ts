import { SentryModuleOptions } from '../utils/sentry';
import { CurrencyPayName } from '../types';

interface EscrowConfig {
  wsEndpoint: string;
  network: string;
  startFromBlock: string;
}

interface UniqueEscrowConfig extends EscrowConfig {
  collectionIds: number[];
  contractOwnerSeed: string | null;
  contractAddress: string | null;
}

interface AuctionConfig {
  seed: string;
  commission: number;
}

export interface MarketConfig {
  postgresUrl: string;
  testingPostgresUrl: string;
  listenPort: number;
  disableSecurity: boolean;
  rootDir: string;
  autoDBMigrations: boolean;
  auction: AuctionConfig;
  marketType: string;
  mainSaleSeed: string;
  adminList: string;
  jwt: {
    access: string;
    refresh: string;
  };
  sentry: SentryModuleOptions;
  dev: {
    debugMigrations: boolean;
    debugScanBlock: boolean;
  };
  swagger: {
    title: string;
    version: string;
    description: string;
  };
  blockchain: {
    escrowSeed: string | null;
    unique: UniqueEscrowConfig;
    kusama: EscrowConfig & {
      ss58Format: number;
      marketCommission: number;
    };
    testing: {
      escrowSeed: string;
      unique: UniqueEscrowConfig;
      kusama: EscrowConfig;
    };
  };
  ipfs: string;
  payment: {
    currentCurrency: CurrencyPayName;
    checkout: {
      secretKey: string;
    };
  };
}
