import { SentryModuleOptions } from '../utils/sentry';

import { CurrencyNames } from '@app/types';

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

export enum MarketType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

interface DatabaseOrm {
  type?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface MarketConfig {
  mode: string;
  postgresUrl: string;
  testingPostgresUrl: string;
  listenPort: number;
  disableSecurity: boolean;
  rootDir: string;
  autoDBMigrations: boolean;
  auction: AuctionConfig;
  marketType: MarketType;
  mainSaleSeed: string;
  adminList: string;
  base: DatabaseOrm;
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
      waitBlocks: number;
    };
    testing: {
      escrowSeed: string;
      unique: UniqueEscrowConfig;
      kusama: EscrowConfig;
    };
  };
  ipfs: string;
  payment: {
    defaultCurrency: CurrencyNames;
    checkout: {
      secretKey: string;
    };
  };
}
