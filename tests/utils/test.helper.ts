import * as fs from 'fs';
import path, { join } from 'path';
import { Logger } from '@nestjs/common';

export class TestHelper {
  private envTestFile = `${process.cwd()}/.env-test`;
  private logger = new Logger('TestHelper');
  private ignoreList = `${process.cwd()}/.ignorelist`;

  /**
   *
   * @param filename
   */
  readBCStatic(filename) {
    return fs.readFileSync(join(process.cwd(), 'market', filename)).toString();
  }

  /**
   *
   * @param cacheDir
   */
  clearCache(cacheDir) {
    for (const file of ['contract.json', 'collection.json']) {
      if (fs.existsSync(path.join(cacheDir, file))) fs.unlinkSync(path.join(cacheDir, file));
    }
  }

  /**
   *
   * @param keyData
   * @param value
   */
  async updateTestEnvironment(keyData: string, value: string) {
    if (keyData === null || keyData === undefined) {
      throw new Error('Set key');
    }
    let data = await this.readFileEnvironment();
    await this.checkAllVariablesEnv(data);

    data = await this.findArgAndReplace(data, keyData.toUpperCase(), value);
    await this.saveDataEnv(data);
  }

  async checkAllVariablesEnv(data: string): Promise<void> {
    const ignoreVar = await this.readIgnoreFile();
    const ignoreString = ignoreVar.toString().replace(/,/g, '|');
    const regex = new RegExp(`(?=^.*=[\\s\'\'])^(?!(${ignoreString})).+`, 'gm');
    const findData = data.match(regex);
    if (findData?.length !== 0) {
      new Error('Missing environment variables');
    }
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
    return fs.readFileSync(this.envTestFile).toString();
  }

  async saveDataEnv(data: string): Promise<void> {
    if (data !== undefined) {
      fs.writeFileSync(this.envTestFile, data.toString());
    }
  }

  async readIgnoreFile(): Promise<any> {
    const list = [];
    if (!fs.existsSync(this.ignoreList)) {
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
}
