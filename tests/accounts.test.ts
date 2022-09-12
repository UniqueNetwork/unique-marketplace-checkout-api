import { INestApplication } from '@nestjs/common';

import { initApp } from './data';

import { TestAccounts } from './utils';

describe('Accounts', () => {
  jest.setTimeout(60 * 60 * 1000);
  let app: INestApplication;
  let testAccounts: TestAccounts;

  beforeAll(async () => {
    app = await initApp();
    await app.init();
    testAccounts = new TestAccounts(app);
    await testAccounts.init();
  });

  afterAll(async () => {
    await testAccounts.destroyTestAccounts();
    await app.close();
  });

  it('Bank account is ok', async () => {
    const res = await testAccounts.checkBankSeed();
    expect(res).toBe(true);
  });
});
