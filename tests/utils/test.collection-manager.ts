import { INestApplication } from '@nestjs/common';
import { SdkProvider } from '@app/uniquesdk';

export class TestCollectionManager {
  private uniqueProvider: SdkProvider;

  constructor(private app: INestApplication) {
    this.app = app;
    this.uniqueProvider = app.get<SdkProvider>('UNIQUE_SDK_PROVIDER');
  }

  async init() {
    console.log('init');
  }

  async createCollection() {
    console.log('createCollection');
  }
}
