import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import '@unique-nft/substrate-client/balance';
import { AllBalances } from '@unique-nft/substrate-client/types';

@Injectable()
export class SdkBalanceService {
  public api: any;
  private logger: Logger = new Logger(SdkBalanceService.name);

  constructor(private sdk: Sdk) {
    this.api = sdk.api;
  }

  /**
   * Get balance
   *
   * @async
   * @param {string} address
   * @returns {Promise<AllBalances>}
   */
  async getBalance(address: string): Promise<AllBalances> {
    return this.sdk.balance.get({ address: address });
  }
}
