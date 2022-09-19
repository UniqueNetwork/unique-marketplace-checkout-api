import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import { AddressOrPair } from '@polkadot/api-base/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import type { ISubmittableResult } from '@polkadot/types/types';
import { ApiPromise } from '@polkadot/api';
import { Account } from '@unique-nft/accounts';
import { stringify } from '@polkadot/util';

import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants/sdk.injectors';
import { NetworkName, TransferTokenResult } from '@app/uniquesdk/sdk.types';

@Injectable()
export class SdkTransferService {
  private logger: Logger;
  /**
   * @class SdkExtrinsicService
   * Transfer operations for chain stage
   * @description Multifunctional class for transfer operations.
   *
   * @param unique
   * @param kusama
   */
  constructor(@InjectUniqueSDK() private readonly unique: Sdk, @InjectKusamaSDK() private readonly kusama: Sdk) {
    this.logger = new Logger(SdkTransferService.name);
  }

  /**
   * Transfer one token from addressOrPairFrom to addressTo
   *
   * @public
   * @async
   * @param {AddressOrPair} addressOrPairFrom
   * @param {string} addressTo
   * @param {string} collection_id
   * @param {string} token_id
   * @param {NetworkName} network
   * @returns {Promise<SubmittableExtrinsic<'promise', ISubmittableResult>>}
   */
  public async transferOneToken(
    addressOrPairFrom: AddressOrPair,
    addressTo: string,
    collection_id: string,
    token_id: string,
    network: NetworkName,
  ): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
    const api = this.getApi(network);
    return api.tx.unique.transfer({ Substrate: addressTo }, collection_id, token_id, 1).signAsync(addressOrPairFrom);
  }

  /**
   * Transfer one token in next accountIndex as available on the node
   *
   * @public
   * @async
   * @param {KeyringPair} keyringPairFrom
   * @param {string} addressTo
   * @param {string} collection_id
   * @param {string} token_id
   * @param {NetworkName} network
   * @returns {Promise<SubmittableExtrinsic<'promise', ISubmittableResult>>}
   */
  public async transferOneTokenNextIndex(
    keyringPairFrom: KeyringPair,
    addressTo: string,
    collection_id: string,
    token_id: string,
    network: NetworkName,
  ): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
    const api = this.getApi(network);
    const nonce = await api.rpc.system.accountNextIndex(keyringPairFrom.address);
    return api.tx.unique.transfer({ Substrate: addressTo }, collection_id, token_id, 1).signAsync(keyringPairFrom, { nonce });
  }

  /**
   * Transfer many from keyringPairFrom to addressTo
   *
   * @public
   * @async
   * @param {KeyringPair} keyringPairFrom
   * @param {string} addressTo
   * @param {bigint} amount
   * @param {NetworkName} network
   * @returns {Promise<SubmittableExtrinsic<'promise', ISubmittableResult>>}
   */
  public async transferMany(
    keyringPairFrom: KeyringPair,
    addressTo: string,
    amount: bigint,
    network: NetworkName,
  ): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
    const api = this.getApi(network);
    const nonce = await api.rpc.system.accountNextIndex(keyringPairFrom.address);
    return api.tx.balances.transferKeepAlive(addressTo, amount).signAsync(keyringPairFrom, { nonce });
  }

  /**
   * Get api for network
   *
   * @private
   * @param {NetworkName} network
   * @returns {ApiPromise}
   */
  private getApi(network: NetworkName): ApiPromise {
    return network === NetworkName.UNIQUE ? this.unique.api : this.kusama.api;
  }

  /**
   * Transfer token
   *
   * @public
   * @async
   * @param {Account<KeyringPair>} fromAccount
   * @param {string} toAddress
   * @param {number} collectionId
   * @param {number} tokenId
   * @returns {Promise<TransferTokenResult>}
   */
  public async transferToken(
    fromAccount: Account<KeyringPair>,
    toAddress: string,
    collectionId: number,
    tokenId: number,
  ): Promise<TransferTokenResult> {
    const { parsed, submittableResult, isCompleted } = await this.unique.tokens.transfer.submitWaitResult(
      {
        address: fromAccount.instance.address,
        to: toAddress,
        collectionId,
        tokenId,
      },
      { signer: fromAccount.getSigner() },
    );

    const blockHash = submittableResult.status.asInBlock;
    const signedBlock = await this.unique.api.rpc.chain.getBlock(submittableResult.status.asInBlock);
    const blockNumber = signedBlock.block.header.number.toBigInt();

    if (isCompleted) {
      this.logger.log(
        `Transfer token ${tokenId} in collection ${collectionId} from address ${parsed.from} to ${parsed.to} from block ${blockNumber}`,
      );
    } else {
      this.logger.error(`Transfer token failed ${stringify(submittableResult.dispatchError)}`);
    }

    return {
      collectionId,
      tokenId,
      addressFrom: parsed.from,
      addressTo: parsed.to,
      blockHash,
      blockNumber,
      isCompleted,
      isError: submittableResult.isError,
      internalError: submittableResult.internalError,
    };
  }
}
