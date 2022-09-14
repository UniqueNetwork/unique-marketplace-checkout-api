export { Auction, AuctionStatus } from './auction';
export { Bid, BidStatus } from './bid';
export { TxInfo, TxArgs } from './tx-info';
export { TokenInfo, CollectionToken, TypeAttributToken, TypeConstSchema, TokenDescription } from './search';
export { SellingMethod, CurrencyNames } from './offers';
export { AddTokenType } from './token';
export { DecodedCollection } from './collection';

export type CalculateArgs = {
  collectionId: number;
  tokenId: number;
  bidderAddress: string;
};

export type PlaceBidArgs = CalculateArgs & {
  amount: string;
  signature: string;
};

export interface CalculationInfo {
  contractPendingPrice: bigint;
  bidderPendingAmount: bigint;
  minBidderAmount: bigint;
  priceStep: bigint;
}

export type AnyAccountFormat =
  | string
  | { address: string }
  | { Ethereum: string }
  | { ethereum: string }
  | { Substrate: string }
  | { substrate: string }
  | Object;

export type NormalizedAccountFormat = { Ethereum: string } | { Substrate: string } | any;
