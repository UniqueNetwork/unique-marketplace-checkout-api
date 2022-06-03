import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import type { ISubmittableResult } from '@polkadot/types/types';
import { ApiPromise } from '@polkadot/api';

import * as logging from '../logging';

export enum TransactionStatus {
  NOT_READY = 'NotReady',
  FAIL = 'Fail',
  SUCCESS = 'Success',
}

const getTransactionStatus = ({ events, status }: ISubmittableResult) => {
  if (status.isReady) {
    return TransactionStatus.NOT_READY;
  }
  if (status.isBroadcast) {
    return TransactionStatus.NOT_READY;
  }
  if (status.isInBlock || status.isFinalized) {
    const errors = events.filter((e) => e.event.data.method === 'ExtrinsicFailed');
    if (errors.length > 0) {
      return TransactionStatus.FAIL;
    }
    if (events.filter((e) => e.event.data.method === 'ExtrinsicSuccess').length > 0) {
      return TransactionStatus.SUCCESS;
    }
  }
  return TransactionStatus.FAIL;
};

export const signTransaction = (
  sender: KeyringPair,
  transaction: SubmittableExtrinsic<'promise', ISubmittableResult>,
  label = 'transaction',
  api: ApiPromise,
): Promise<{ result: ISubmittableResult; status: TransactionStatus; errorMessage: string | null }> =>
  new Promise(async (resolve, reject) => {
    try {
      const unsub = await transaction.signAndSend(sender, (result) => {
        const status = getTransactionStatus(result);

        if (status === TransactionStatus.NOT_READY) {
          return;
        }

        if (status === TransactionStatus.SUCCESS) {
          logging.log(`${label} successful`);
        }

        if (status === TransactionStatus.FAIL) {
          logging.log(`Something went wrong with ${label}. Status: ${status}`, logging.level.ERROR);
          logging.log(result.toHuman(), logging.level.ERROR);
        }

        let errorMessage: string | null = null;
        if (result.dispatchError) {
          if (result.dispatchError.isModule) {
            // for module errors, we have the section indexed, lookup
            const decoded = api.registry.findMetaError(result.dispatchError.asModule);
            const { docs, name, section } = decoded;
            errorMessage = `${section}.${name}: ${docs.join(' ')}`;
          } else {
            // Other, CannotLookup, BadOrigin, no extra info
            errorMessage = result.dispatchError.toString();
          }
        }

        resolve({ result, status, errorMessage });
        unsub();
      });
    } catch (e) {
      logging.log(e, logging.level.ERROR);
      reject(e);
    }
  });
