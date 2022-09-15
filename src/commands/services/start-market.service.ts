import { Inject, Injectable } from '@nestjs/common';
import { MarketConfig } from '@app/config/market-config';
import * as fs from 'fs';
import { SdkTestService } from '@app/uniquesdk/sdk.service';

@Injectable()
export class StartMarketService {
  private envLocal: string;
  private projectPath: string;

  constructor(@Inject('CONFIG') private config: MarketConfig, private sdkUnique: SdkTestService) {
    this.envLocal = `${process.cwd()}/.env-local`;
    this.projectPath = `${process.cwd()}`;
  }

  /**
   *
   */
  async start() {
    await this.sdkUnique.connect(this.config, 'unique');

    const signer = await this.sdkUnique.convertSeedToSdkSigner(
      'disease language device hood avoid muffin panther century theory assault tube spring',
    );

    const payloadAuction = await this.sdkUnique.tranferToken(
      '5FEc7FEv72ptJZmmgeCUDeaViQvFmVd3y6L4VdmR5N2tHzgd',
      '5G9RN6hukfQdZrRPq2VzYSDrtSdCA13cTzMej7QPxY5pGEyU',
      398,
      12,
      signer,
    );
    console.log(JSON.stringify(payloadAuction.transfer));
    console.log(payloadAuction);
  }

  /**
   *
   */
  async setup() {
    // Env file
    const envDev = `${process.cwd()}/.env`;
    // Check  env file
    await this.checkEnvFile(envDev);
    fs.readFile(envDev, 'utf-8', (err, file) => {
      const lines = file.split('\n');

      for (const line of lines) console.log(line);
    });
  }

  /**
   *
   * @param envDev
   */
  async checkEnvFile(envDev) {
    if (!fs.existsSync(envDev)) {
      fs.copyFile(this.envLocal, envDev, (err) => {
        if (err) {
          console.log('Error Found:', err);
        } else {
          console.log('\nFile Contents of copied_file:', fs.readFileSync(envDev, 'utf8'));
        }
      });
      console.log('\nFile Contents of copied file:', fs.readFileSync(envDev, 'utf8'));
    }
  }

  async destroy() {
    process.exit(0);
  }
}
