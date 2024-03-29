import { Server, Socket } from 'socket.io';
import { Emitter } from '@socket.io/postgres-emitter';
import { OfferEntityDto } from '../../offers/dto/offer-dto';

export type ServerToClientEvents = {
  auctionStarted: (offer: OfferEntityDto) => void;
  bidPlaced: (offer: OfferEntityDto) => void;
  auctionStopped: (offer: OfferEntityDto) => void;
  auctionClosed: (offer: OfferEntityDto) => void;
  errorMessage: (message: string) => void;
};

export type TokenIds = { collectionId: number; tokenId: number };

export type ClientToServerEvents = {
  subscribeToAuction: (ids: TokenIds) => void;
  unsubscribeFromAuction: (ids: TokenIds) => void;
};

type InterServerEvents = Record<string, never>;

type SocketData = Record<string, never>;

export type BroadcastIOEmitter = Emitter<ServerToClientEvents, InterServerEvents>;
export type BroadcastIOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type BroadcastIOSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
