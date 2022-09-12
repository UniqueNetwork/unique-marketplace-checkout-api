import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import { IObject, IStateQueries } from '@app/uniquesdk/sdk.types';
import { SdkStateQueries } from '@unique-nft/substrate-client/state-queries';

@Injectable()
export class SdkStateService extends SdkStateQueries {
  private readonly sdkExt: Sdk;
  public api;
  private logger: Logger;

  /**
   * @class SdkStateService
   * Queries for chain stage
   * @description A multifunctional class that allows you to receive data from storage on request.
   * @param {Sdk} sdk - The sdk instance
   */
  constructor(sdk: Sdk) {
    super(sdk);
    this.sdkExt = sdk;
    this.logger = new Logger('SdkStageService');
    this.api = sdk.api;
  }

  async collectionById(address: string): Promise<IStateQueries | IObject> {
    return await this.sdkExt.stateQueries.execute({
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
    return await this.sdkExt.stateQueries.execute({
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
    return this.sdkExt.stateQueries.execute({
      endpoint: 'query',
      module: 'system',
      method: 'account',
      args: [address],
    });
  }

  async sponsoringMode(address: string): Promise<IStateQueries | IObject> {
    return this.sdkExt.stateQueries.execute({
      endpoint: 'query',
      module: 'evmContractHelpers',
      method: 'sponsoringMode',
      args: [address],
    });
  }

  async allowlist(contractAddress: string, ethAddress: string): Promise<IStateQueries | IObject> {
    return this.sdkExt.stateQueries.execute({
      endpoint: 'query',
      module: 'evmContractHelpers',
      method: 'allowlist',
      args: [contractAddress, ethAddress],
    });
  }

  async tokenData(collectionId: number, tokenId: number): Promise<IStateQueries | IObject> {
    return this.sdkExt.stateQueries.execute({
      endpoint: 'query',
      module: 'nonfungible',
      method: 'tokenData',
      args: [collectionId, tokenId],
    });
  }
}
