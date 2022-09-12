import { Injectable, Logger } from '@nestjs/common';
import { Sdk } from '@unique-nft/substrate-client';
import { KeyringPair } from '@polkadot/keyring/types';
import { Account } from '@unique-nft/accounts';
import { HexString, ISubmittableResult, SignerPayloadJSON } from '@unique-nft/substrate-client/types';
import { stringify } from '@polkadot/util';

import { TransferBalanceResult, TransferTokenResult } from '@app/uniquesdk/sdk.types';

@Injectable()
export class SdkTransferService {
  private logger: Logger;
  public api: any;
  /**
   * @class SdkExtrinsicService
   * Transfer operations for chain stage
   * @description Multifunctional class for transfer operations.
   *
   * @param unique
   * @param kusama
   */
  constructor(private sdk: Sdk) {
    this.api = sdk.api;
    this.logger = new Logger('SdkTransferService');
  }

  /**
   * Transfer money
   *
   * @public
   * @async
   * @param {Account<KeyringPair>} fromAccount
   * @param {string} destination
   * @param {bigint} amount
   * @returns {Promise<{ succeed: boolean; blockNumber: bigint }>}
   */
  public async moneyTransfer(
    fromAccount: Account<KeyringPair>,
    destination: string,
    amount: bigint,
  ): Promise<{ succeed: boolean; blockNumber: bigint }> {
    const numberAmount = Number(amount) / 1000000000000;
    const { parsed, submittableResult } = await this.sdk.balance.transfer.submitWaitResult(
      {
        address: fromAccount.instance.address,
        destination,
        amount: numberAmount,
      },
      { signer: fromAccount.getSigner() },
    );

    const blockNumber = await this.getBlockNumber(submittableResult);

    return {
      succeed: parsed.success,
      blockNumber,
    };
  }

  /**
   * Transfer token payload and signature
   *
   * @public
   * @async
   * @param {SignerPayloadJSON} signerPayloadJSON
   * @param {HexString} signature
   * @returns {Promise<TransferTokenResult>}
   */
  public async submitTransferToken(signerPayloadJSON: SignerPayloadJSON, signature: HexString): Promise<TransferTokenResult> {
    const { parsed, submittableResult, isCompleted } = await this.sdk.tokens.transfer.submitWaitResult({ signerPayloadJSON, signature });
    const { collectionId, tokenId, from, to } = parsed;
    const blockHash = submittableResult.status.asInBlock;
    const blockNumber = await this.getBlockNumber(submittableResult);

    if (isCompleted) {
      this.logger.log(`Transfer token ${tokenId} in collection ${collectionId} from address ${from} to ${to} from block ${blockNumber}`);
    } else {
      this.logger.error(`Transfer token failed ${stringify(submittableResult.dispatchError)}`);
    }

    return {
      collectionId,
      tokenId,
      addressFrom: from,
      addressTo: to,
      blockHash,
      blockNumber,
      isCompleted,
      isError: submittableResult.isError,
      internalError: submittableResult.internalError,
    };
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
    const { parsed, submittableResult, isCompleted } = await this.sdk.tokens.transfer.submitWaitResult(
      {
        address: fromAccount.instance.address,
        to: toAddress,
        collectionId,
        tokenId,
      },
      { signer: fromAccount.getSigner() },
    );

    const blockHash = submittableResult.status.asInBlock;
    const blockNumber = await this.getBlockNumber(submittableResult);

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

  /**
   * Balance transfer
   *
   * @public
   * @async
   * @param {SignerPayloadJSON} signerPayloadJSON
   * @param {HexString} signature
   * @returns {Promise<TransferBalanceResult>}
   */
  public async transferBalance(signerPayloadJSON: SignerPayloadJSON, signature: HexString): Promise<TransferBalanceResult> {
    const submittableResult = await this.sdk.extrinsics.submitWaitCompleted({ signerPayloadJSON, signature });
    const blockNumber = await this.getBlockNumber(submittableResult);

    const dataEvent =
      submittableResult.events
        .find(({ event: { data, method, section } }) => section === 'balances' && method === 'Transfer' && data.length === 3)
        ?.event?.data?.toJSON() || null;

    const transferData = dataEvent
      ? {
          sender: dataEvent[0] as string,
          recipient: dataEvent[1] as string,
          amount: dataEvent[2] as number,
        }
      : null;

    return {
      isCompleted: submittableResult.isCompleted,
      isError: submittableResult.isError,
      blockNumber,
      transferData,
    };
  }

  /**
   * Get signed block number
   *
   * @private
   * @async
   * @param {ISubmittableResult} submittableResult
   * @returns {Promise<bigint>}
   */
  private async getBlockNumber(submittableResult: ISubmittableResult): Promise<bigint> {
    const signedBlock = await this.sdk.api.rpc.chain.getBlock(submittableResult.status.asInBlock);
    return signedBlock.block.header.number.toBigInt();
  }
}
