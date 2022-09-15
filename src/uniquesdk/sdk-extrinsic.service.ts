import { Injectable, Logger } from '@nestjs/common';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { stringify } from '@polkadot/util';
import { ApiPromise } from '@polkadot/api';
import { IExtrinsic } from '@polkadot/types/types';
import type { ExtrinsicStatus } from '@polkadot/types/interfaces/author';
import { Hash } from '@polkadot/types/interfaces';
import { Sdk } from '@unique-nft/substrate-client';
import { SignerPayloadJSON, HexString, ISubmittableResult } from '@unique-nft/substrate-client/types';
import { InjectKusamaSDK, InjectUniqueSDK } from '@app/uniquesdk/constants/sdk.injectors';
import { SubmitResult, NetworkName, TransferTokenResult, TransferBalanceResult } from '@app/uniquesdk/sdk.types';

@Injectable()
export class SdkExtrinsicService {
  private logger: Logger;

  /**
   * @class SdkExtrinsicService
   * Extrinsic for chain stage
   * @description A multifunctional class that allows you to send data to the parachain.
   *
   * @param unique
   * @param kusama
   */
  constructor(@InjectUniqueSDK() private readonly unique: Sdk, @InjectKusamaSDK() private readonly kusama: Sdk) {
    this.logger = new Logger('SdkExtrinsicService');
  }

  /**
   * Submit extrinsic
   *
   * @public
   * @async
   * @param {(string | SubmittableExtrinsic<any>)} tx
   * @param {NetworkName} network
   * @returns {Promise<SubmitResult>}
   */
  public async submit(tx: string | SubmittableExtrinsic<any>, network: NetworkName): Promise<SubmitResult> {
    const api = this.getCurrentSdk(network).api;
    const extrinsic = typeof tx === 'string' ? api.createType('Extrinsic', tx) : tx;
    const extrinsicHuman = stringify(extrinsic.toHuman());

    const blockHash = await this.submitWatch(api, extrinsic);
    const signedBlock = await api.rpc.chain.getBlock(blockHash);

    const apiAt = await api.at(blockHash);
    const eventsAtBlock = await apiAt.query.system.events();

    const finalizedExtrinsicIndex = signedBlock.block.extrinsics.findIndex((ex) => ex.hash.eq(extrinsic.hash));

    const finalizedExtrinsicEvents = eventsAtBlock.filter(
      ({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(finalizedExtrinsicIndex),
    );

    const isSucceed = finalizedExtrinsicEvents.some((event) => api.events.system.ExtrinsicSuccess.is(event.event));

    const txResult = {
      isSucceed,
      blockNumber: signedBlock.block.header.number.toBigInt(),
      blockHash,
    };

    this.logger.debug(`${extrinsicHuman}; ${stringify(txResult)}`);

    return txResult;
  }

  /**
   * Submit watch extrinsic
   *
   * @private
   * @async
   * @param {ApiPromise} api
   * @param {IExtrinsic} extrinsic
   * @returns {Promise<Hash>}
   */
  private async submitWatch(api: ApiPromise, extrinsic: IExtrinsic): Promise<Hash> {
    return new Promise(async (resolve, reject) => {
      const extrinsicHuman = stringify(extrinsic.toHuman());

      let unsubscribe: VoidFunction = () => {
        this.logger.debug(`${extrinsicHuman}; called noop unsubscribe()`);
      };

      const checkStatus = (status: ExtrinsicStatus) => {
        switch (status.type) {
          case 'FinalityTimeout':
          case 'Usurped':
          case 'Dropped':
          case 'Invalid': {
            this.logger.warn(`${extrinsicHuman}; ${status.type}; ${stringify(status)}`);
            unsubscribe();

            reject(new Error(`Failed with status ${status.type}`));
            break;
          }
          case 'Finalized': {
            this.logger.log(`${extrinsicHuman}; ${status.type}; ${stringify(status)}`);
            unsubscribe();

            resolve(status.asFinalized);
            break;
          }
          default: {
            this.logger.log(`${extrinsicHuman}; ${status.type}; ${stringify(status)}`);
          }
        }
      };

      api.rpc.author
        .submitAndWatchExtrinsic(extrinsic, checkStatus)
        .then((uns) => {
          unsubscribe = uns;
        })
        .catch((error) => {
          unsubscribe();
          this.logger.warn(`${extrinsicHuman}; unexpected submitAndWatchExtrinsic error;  ${error}`);
          reject(error);
        });
    });
  }

  /**
   * Transfer token
   *
   * @public
   * @async
   * @param {SignerPayloadJSON} signerPayloadJSON
   * @param {HexString} signature
   * @param {NetworkName} network
   * @returns {Promise<TransferTokenResult>}
   */
  public async submitTransferToken(
    signerPayloadJSON: SignerPayloadJSON,
    signature: HexString,
    network: NetworkName,
  ): Promise<TransferTokenResult> {
    const currentSdk = this.getCurrentSdk(network);

    const { parsed, submittableResult, isCompleted } = await currentSdk.tokens.transfer.submitWaitResult({ signerPayloadJSON, signature });
    const { collectionId, tokenId, from, to } = parsed;
    const blockHash = submittableResult.status.asInBlock;
    const blockNumber = await this.getBlockNumber(submittableResult, currentSdk);

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
   * Balance transfer
   *
   * @public
   * @async
   * @param {SignerPayloadJSON} signerPayloadJSON
   * @param {HexString} signature
   * @param {NetworkName} network
   * @returns {Promise<TransferBalanceResult>}
   */
  public async transferBalance(
    signerPayloadJSON: SignerPayloadJSON,
    signature: HexString,
    network: NetworkName,
  ): Promise<TransferBalanceResult> {
    const currentSdk = this.getCurrentSdk(network);
    const submittableResult = await currentSdk.extrinsics.submitWaitCompleted({ signerPayloadJSON, signature });
    const blockNumber = await this.getBlockNumber(submittableResult, currentSdk);

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
   * @param {Sdk} sdk
   * @returns {Promise<bigint>}
   */
  private async getBlockNumber(submittableResult: ISubmittableResult, sdk: Sdk): Promise<bigint> {
    const signedBlock = await sdk.api.rpc.chain.getBlock(submittableResult.status.asInBlock);
    return signedBlock.block.header.number.toBigInt();
  }

  /**
   * Get network SDK
   *
   * @private
   * @param {NetworkName} network
   * @returns {Sdk}
   */
  private getCurrentSdk(network: NetworkName): Sdk {
    switch (network) {
      case NetworkName.KUSAMA:
        return this.kusama;
      default:
        return this.unique;
    }
  }
}
