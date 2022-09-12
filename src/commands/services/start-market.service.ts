import { Inject, Injectable, Logger } from '@nestjs/common';
import { MarketConfig } from '@app/config';
import * as fs from 'fs';

//import dataInfo from 'data.json';

@Injectable()
export class StartMarketService {
  private envLocal: string;
  private projectPath: string;
  private logger: Logger;

  constructor(@Inject('CONFIG') private config: MarketConfig) {
    this.envLocal = `${process.cwd()}/.env-local`;
    this.projectPath = `${process.cwd()}`;
    this.logger = new Logger('StartMarketService');
  }

  /**
   *
   */
  async setup() {
    let data = await this.readFileEnvironment();
    await this.checkAllVariablesEnv(data);

    data = await this.findArgAndReplace(data, 'AUCTION_SEED2', 'test');
    await this.saveDataEnv(data);
  }

  async findArgAndReplace(data: any, key: string, value: string): Promise<string> {
    let keyData;
    try {
      if (data === null || data === undefined) {
        throw new Error('No data provided');
      }

      if (key === null || key === undefined) {
        throw new Error('Set key');
      } else {
        keyData = key.toUpperCase();
      }

      const regexKey = new RegExp(keyData + '=.*$', 'gm');
      const validateKey = data.match(regexKey);
      if (validateKey?.length === 0 || validateKey === null) {
        throw new Error('No matched data');
      }
      return data.replace(regexKey, `${keyData}=${value}`);
    } catch (e) {
      this.logger.error('No update selected key');
    }
  }

  async readFileEnvironment(): Promise<string> {
    return fs.readFileSync('.env').toString();
  }

  async saveDataEnv(data: string): Promise<void> {
    if (data !== undefined) {
      fs.writeFileSync('.env', data.toString());
    }
  }

  async checkAllVariablesEnv(data: string) {
    const ignoreVar = await this.readIgnoreFile();
    const ignoreString = ignoreVar.toString().replace(/,/g, '|');
    const regex = new RegExp(`(?=^.*=[\\s\'\'])^(?!(${ignoreString})).+`, 'gm');
    const findData = data.match(regex);
    console.log(findData);
  }

  private async readIgnoreFile(): Promise<any> {
    const ignoreList = `${process.cwd()}/.ignorelist`;
    const list = [];
    if (!fs.existsSync(ignoreList)) {
      this.logger.warn('Missing ignore list file in root directory of application');
      return list;
    } else {
      const fileIgnore = fs.readFileSync('.ignorelist').toString().split('\n');
      fileIgnore.find((keys) => {
        if (keys !== '') {
          list.push(keys);
        }
      });
      return list;
    }
  }

  async checkEnvFile(): Promise<boolean> {
    const envDev = `${process.cwd()}/.env`;
    if (!fs.existsSync(envDev)) {
      fs.copyFile(this.envLocal, envDev, (err) => {
        if (err) {
          this.logger.log('Error Found:', err);
          return false;
        } else {
          return true;
        }
      });
    } else {
      return true;
    }
  }

  async destroy() {
    process.exit(0);
  }
}
