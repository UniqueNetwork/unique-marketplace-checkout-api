import { config } from 'dotenv';
import { InitialOptionsTsJest } from 'ts-jest';
import { join } from 'path';
const esModules = ['@polkadot/'].join('|');

config({ path: join(process.cwd(), '.env-test') });

export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  testRegex: '.test.ts$',
  verbose: true,
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/../src/$1',
  },
  transform: {
    '^.+\\.(js|ts)$': 'ts-jest',
  },
  transformIgnorePatterns: [`/node_modules/(?!${esModules})`],
  resolver: './resolver.js',
} as InitialOptionsTsJest;
