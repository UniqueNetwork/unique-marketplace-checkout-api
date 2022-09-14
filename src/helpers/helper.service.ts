import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { AnyAccountFormat, NormalizedAccountFormat } from '@app/types';
import { Keyring } from '@polkadot/api';
import * as fs from 'fs';
import path, { join } from 'path';
import { cryptoWaitReady, decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { KeyringPair } from '@polkadot/keyring/types';
import { IKeyringPair } from '@polkadot/types/types';

@Injectable()
export class HelperService {
  addDays(days = 0, from = new Date()): Date {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  addMinutes(minutes = 0, from = new Date()): Date {
    return new Date(from.getTime() + minutes * 60 * 1000);
  }

  checkDateAndMinutes(days: number, minutes: number): void {
    if (days === 0 && minutes === 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Days and minutes cannot be zero at the same time',
      });
    }
  }

  toEnum(input: Record<string, string>): string {
    return Object.values(input)
      .map((v) => `'${v}'`)
      .join(', ');
  }

  vec2str(arr): string {
    return arr.map((x) => String.fromCharCode(parseInt(x))).join('');
  }

  str2vec(string: string): number[] {
    if (typeof string !== 'string') return string;
    return Array.from(string).map((x) => x.charCodeAt(0));
  }

  /**
   * @description Convert
   * @param input
   */
  normalizeAccountId(input: AnyAccountFormat): NormalizedAccountFormat {
    if (typeof input === 'string') {
      if (input.length === 48 || input.length === 47) {
        return { Substrate: input };
      } else if (input.length === 42 && input.startsWith('0x')) {
        return { Ethereum: input.toLowerCase() };
      } else if (input.length === 40 && !input.startsWith('0x')) {
        return { Ethereum: '0x' + input.toLowerCase() };
      } else {
        throw new Error(`Unknown address format: "${input}"`);
      }
    }
    if ('address' in input) {
      return { Substrate: input.address };
    }
    if ('Ethereum' in input) {
      return {
        Ethereum: input.Ethereum.toLowerCase(),
      };
    } else if ('ethereum' in input) {
      return {
        Ethereum: (input as any).ethereum.toLowerCase(),
      };
    } else if ('Substrate' in input) {
      return input;
    } else if ('substrate' in input) {
      return {
        Substrate: (input as any).substrate,
      };
    }

    // AccountId
    return { Substrate: input.toString() };
  }

  privateKey(account: string): IKeyringPair {
    return new Keyring({ type: 'sr25519' }).addFromUri(account);
  }

  extractCollectionIdFromAddress(address: string): number {
    if (!(address.length == 42 || address.length == 40)) throw new Error('address wrong format');
    return parseInt(address.substr(address.length - 8), 16);
  }

  marketABIStaticFile(filename: string): string {
    return fs.readFileSync(join(process.cwd(), 'market', filename)).toString();
  }

  async seedToAddress(seed: string): Promise<string> {
    await cryptoWaitReady();
    const keyring = new Keyring({ type: 'sr25519' });
    return keyring.addFromUri(seed).address;
  }

  async convertAddress(address: string, ss58Format?: number): Promise<string> {
    await cryptoWaitReady();
    return encodeAddress(decodeAddress(address), ss58Format);
  }

  mapProperties(obj: any): any {
    const mapped = {};
    obj['properties'].forEach((prop) => (mapped[prop.key.startsWith('_old_') ? prop.key.slice(5) : prop.key] = prop.value));
    return mapped;
  }

  getInstance(): any {
    return this;
  }
}
