export const ASK_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  BOUGHT: 'bought',
  REMOVED_BY_ADMIN: 'removed_by_admin',
  PENDING: 'pending',
  ERROR: 'error',
};

export const MONEY_TRANSFER_TYPES = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
};

export const MONEY_TRANSFER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export interface IOfferInsertData {
  collectionId: number;
  tokenId: number;
  addressFrom: string;
  addressTo: string;
  price: number;
  currency: string;
}

export interface IRegisterTransferAddress {
  Ethereum?: string;
  Substrate?: string;
}

export interface IRegisterTransferData {
  collectionId: number;
  tokenId: number;
  addressFrom: IRegisterTransferAddress;
  addressTo: IRegisterTransferAddress;
}
