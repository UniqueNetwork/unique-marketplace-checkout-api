import { INestApplication } from '@nestjs/common';

import { initApp } from './data';

describe('App', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await initApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ok', () => {
    expect(true).toBe(true);
  });
});
