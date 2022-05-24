import * as logging from '../logging';

export const transactionStatus = {
  NOT_READY: 'NotReady',
  FAIL: 'Fail',
  SUCCESS: 'Success',
};

const getTransactionStatus = ({ events, status }) => {
  if (status.isReady) {
    return transactionStatus.NOT_READY;
  }
  if (status.isBroadcast) {
    return transactionStatus.NOT_READY;
  }
  if (status.isInBlock || status.isFinalized) {
    const errors = events.filter((e) => e.event.data.method === 'ExtrinsicFailed');
    if (errors.length > 0) {
      return transactionStatus.FAIL;
    }
    if (events.filter((e) => e.event.data.method === 'ExtrinsicSuccess').length > 0) {
      return transactionStatus.SUCCESS;
    }
  }

  return status.FAIL;
};

export const signTransaction = (sender, transaction, label = 'transaction') => {
  return new Promise(async (resolve, reject) => {
    try {
      const unsub = await transaction.signAndSend(sender, (result) => {
        const status = getTransactionStatus(result);

        if (status === transactionStatus.SUCCESS) {
          logging.log(`${label} successful`);
          resolve({ result, status });
          unsub();
        } else if (status === transactionStatus.FAIL) {
          logging.log(`Something went wrong with ${label}. Status: ${status}`, logging.level.ERROR);
          logging.log(result.toHuman(), logging.level.ERROR);
          reject({ result, status });
          unsub();
        }
      });
    } catch (e) {
      logging.log(e, logging.level.ERROR);
      reject(e);
    }
  });
};
