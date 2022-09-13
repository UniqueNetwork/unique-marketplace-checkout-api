import * as path from 'path';
import 'dotenv/config';

import { CurrencyNames } from '@app/types';

import { MarketConfig, MarketType } from './types';

export const appConfig: MarketConfig = {
  mode: process.env.NODE_ENV || 'production',
  marketType: process.env.MARKET_TYPE === 'primary' ? MarketType.PRIMARY : MarketType.SECONDARY,
  postgresUrl: process.env.POSTGRES_URL,
  testingPostgresUrl: process.env.POSTGRES_TEST_URL,
  listenPort: parseInt(process.env.API_PORT) || 5000,
  disableSecurity: process.env.DISABLE_SECURITY === 'true',
  rootDir: path.normalize(path.join(__dirname, '..')),
  autoDBMigrations: process.env.AUTO_DB_MIGRATIONS === 'true',
  mainSaleSeed: process.env.MAINSALE_SEED || null,
  adminList: process.env.ADMIN_LIST || '',
  base: {
    host: process.env.POSTGRES_HOST || 'marketplace-postgres',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    username: process.env.POSTGRES_USER || 'marketplace',
    password: process.env.POSTGRES_PASSWORD || '12345',
    database: process.env.POSTGRES_DB || 'marketplace_db',
  },
  dev: {
    debugMigrations: process.env.DEBUG_DBASE === 'true',
    debugScanBlock: process.env.DEBUG_SCAN_BLOCK === 'true',
  },
  jwt: {
    access: '24h',
    refresh: '7d',
  },
  sentry: {
    enabled: process.env.SENTRY_ENABLED === 'true',
    environment: process.env.SENTRY_ENV || 'dev',
    dsn: process.env.SENTRY_DSN || 'https://hash@domain.tld/sentryId',
    debug: process.env.SENTRY_DEBUG === 'true',
    release: process.env.SENTRY_RELEASE || '',
  },
  swagger: {
    title: 'Marketplace api',
    version: '1.0',
    description: '',
  },
  blockchain: {
    escrowSeed: process.env.ESCROW_SEED || null,
    unique: {
      wsEndpoint: process.env.UNIQUE_WS_ENDPOINT || 'wss://quartz.unique.network',
      network: process.env.UNIQUE_NETWORK || 'quartz',
      startFromBlock: `${process.env.UNIQUE_START_FROM_BLOCK || 'current'}`,
      contractOwnerSeed: process.env.CONTRACT_ETH_OWNER_SEED || null,
      contractAddress: process.env.CONTRACT_ADDRESS || null,
      collectionIds: (process.env.UNIQUE_COLLECTION_IDS || '')
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => !isNaN(x) && x > 0 && x !== Infinity),
    },
    kusama: {
      wsEndpoint: process.env.KUSAMA_WS_ENDPOINT || 'wss://kusama-rpc.polkadot.io',
      network: process.env.KUSAMA_NETWORK || 'kusama',
      startFromBlock: `${process.env.KUSAMA_START_FROM_BLOCK || 'current'}`,
      ss58Format: parseInt(process.env.KUSAMA_SS58_FORMAT || '2'),
      marketCommission: parseInt(process.env.COMMISSION_PERCENT || '10'),
      waitBlocks: parseInt(process.env.KUSAMA_WAIT_BLOCKS || '0'),
    },
    testing: {
      escrowSeed: '//Alice',
      unique: {
        wsEndpoint: 'ws://localhost:9944',
        network: 'private_opal',
        startFromBlock: '1',
        contractOwnerSeed: null,
        contractAddress: null,
        collectionIds: [1],
      },
      kusama: {
        wsEndpoint: 'wss://ws-relay-opal.unique.network',
        network: 'private_kusama',
        startFromBlock: '1',
      },
    },
  },
  auction: {
    seed: process.env.AUCTION_SEED || '',
    commission: parseInt(process.env.AUCTION_COMMISSION || '10', 10),
  },
  ipfs: process.env.IPFS || 'https://ipfs.uniquenetwork.dev/ipfs',
  payment: {
    defaultCurrency: (process.env.CURRENT_CURRENCY as CurrencyNames) || CurrencyNames.USD,
    checkout: {
      secretKey: process.env.CHECKOUT_SECRET_KEY || '',
    },
  },
};

export const configProviders = [
  {
    provide: 'CONFIG',
    useFactory: () => appConfig,
  },
];
