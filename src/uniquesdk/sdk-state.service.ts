import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';

import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants/sdk.injectors';
import { IObject, IStateQueries } from '@app/uniquesdk/sdk.types';

@Injectable()
export class SdkStateService {
  public sdk: Sdk;
  public api;
  private logger: Logger;

  /**
   * @class SdkStateService
   * Queries for chain stage
   * @description A multifunctional class that allows you to receive data from storage on request.
   *
   * @param unique
   * @param kusama
   */
  constructor(@InjectUniqueSDK() private readonly unique: Sdk, @InjectKusamaSDK() private readonly kusama: Sdk) {
    this.logger = new Logger('SdkStageService');
  }

  /**
   * Select chain
   * @description This method allows you to select the chain you want to use.
   * @param {String} network - 'unique' or 'kusama'
   * @returns {void}
   */
  connect(network = 'unique'): void {
    this.sdk = network === 'unique' ? this.unique : this.kusama;
    this.api = this.sdk.api;
  }

  async collectionById(address: string): Promise<IStateQueries | IObject> {
    return await this.sdk.stateQueries.execute({
      endpoint: 'query',
      module: 'common',
      method: 'collectionById',
      args: [address],
    });
  }

  /**
   * Set self as sponsoring for a collection
   * @param address
   */
  async selfSponsoring(address: string): Promise<IStateQueries | IObject> {
    return await this.sdk.stateQueries.execute({
      endpoint: 'query',
      module: 'evmContractHelpers',
      method: 'selfSponsoring',
      args: [address],
    });
  }

  /**
   * Sponsoring Mode
   * @param address
   */
  async account(address: string): Promise<IStateQueries | IObject> {
    return this.sdk.stateQueries.execute({
      endpoint: 'query',
      module: 'system',
      method: 'account',
      args: [address],
    });
  }

  async sponsoringMode(address: string): Promise<IStateQueries | IObject> {
    return this.sdk.stateQueries.execute({
      endpoint: 'query',
      module: 'evmContractHelpers',
      method: 'sponsoringMode',
      args: [address],
    });
  }

  async allowlist(contractAddress: string, ethAddress: string): Promise<IStateQueries | IObject> {
    return this.sdk.stateQueries.execute({
      endpoint: 'query',
      module: 'evmContractHelpers',
      method: 'allowlist',
      args: [contractAddress, ethAddress],
    });
  }

  async tokenData(collectionId: number, tokenId: number): Promise<IStateQueries | IObject> {
    return this.sdk.stateQueries.execute({
      endpoint: 'query',
      module: 'nonfungible',
      method: 'tokenData',
      args: [collectionId, tokenId],
    });
  }

  disconnect() {
    if (this.api.isReady) {
      this.api.disconnect();
    }
  }
}
