import { encodeAddress } from '@polkadot/util-crypto';
import { BadRequestException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';

import { BroadcastService } from '@app/broadcast/services/broadcast.service';
import { ASK_STATUS } from '@app/escrow/constants';
import { BlockchainBlock, OffersEntity } from '@app/entity';
import { MarketConfig } from '@app/config';

import { DateHelper } from '@app/utils/date-helper';
import { getTokenDescription } from '@app/utils';

import { AuctionStatus } from '@app/types';
import { AuctionDto, OfferEntityDto } from '@app/offers/dto/offer-dto';
import { SearchIndexService } from './search-index.service';
import { AuctionCredentials } from '../providers';
import { InjectSentry, SentryService } from '@app/utils/sentry';
import { CreateAuctionAndBroadcastArgs } from '@app/types/auction';
import { CreateAuctionRequest } from '../requests';
import { Web3Service } from '@app/uniquesdk/web3.service';
import { InjectUniqueSDK } from '@app/uniquesdk';
import { SdkProvider } from '../../uniquesdk/sdk-provider';

type FailedAuctionArgs = {
  collectionId: string;
  tokenId: string;
  startPrice: bigint;
  priceStep: bigint;
  days: number;
  minutes: number;
};

@Injectable()
export class AuctionCreationService {
  private readonly logger = new Logger(AuctionCreationService.name);
  private blockchainBlockRepository: Repository<BlockchainBlock>;
  private readonly offersEntityRepository: Repository<OffersEntity>;

  constructor(
    private connection: DataSource,
    private broadcastService: BroadcastService,
    @InjectUniqueSDK() private readonly uniqueProvider: SdkProvider,
    private readonly web3conn: Web3Service,
    @Inject('CONFIG') private config: MarketConfig,
    private searchIndexService: SearchIndexService,
    @Inject('AUCTION_CREDENTIALS') private auctionCredentials: AuctionCredentials,
    @InjectSentry() private readonly sentryService: SentryService,
  ) {
    this.offersEntityRepository = connection.getRepository(OffersEntity);
    this.blockchainBlockRepository = connection.getRepository(BlockchainBlock);
  }

  async checkOwner(collectionId: number, tokenId: number): Promise<boolean> {
    const token = (await this.uniqueProvider.stateService.tokenData(collectionId, tokenId)).json;
    const owner = token['owner'];

    const auctionSubstract = encodeAddress(this.auctionCredentials.uniqueAddress);
    const auctionEth = this.web3conn.subToEth(auctionSubstract).toLowerCase();

    if (owner?.substrate) {
      return encodeAddress(owner.substrate) === auctionSubstract;
    }

    if (owner?.ethereum) {
      return owner.ethereum === auctionEth;
    }
    return false;
  }

  /**
   * Create auction
   * @param createAuctionRequest
   */
  async create(createAuctionRequest: CreateAuctionRequest): Promise<OfferEntityDto> {
    const { days, minutes, startPrice, priceStep, signature, signerPayloadJSON } = createAuctionRequest;

    const { blockNumber, collectionId, tokenId, addressFrom, isCompleted, internalError, blockHash } =
      await this.uniqueProvider.transferService.submitTransferToken(signerPayloadJSON, signature);

    if (!isCompleted) {
      this.sentryService.instance().captureException(new BadRequestException(internalError), {
        tags: { section: 'contract_ask' },
      });
      throw new BadRequestException({
        statusCode: HttpStatus.CONFLICT,
        message: `Failed at block # ${blockNumber} (${blockHash.toHex()})`,
      });
    }

    if (blockNumber === undefined || blockNumber === null || blockNumber.toString() === '0') {
      this.sentryService.message('sendTransferExtrinsic');

      throw new BadRequestException({
        statusCode: HttpStatus.CONFLICT,
        message: 'Block number is not defined',
      });
    }

    let stopAt = DateHelper.addDays(days);
    if (minutes) stopAt = DateHelper.addMinutes(minutes, stopAt);

    const block = this.blockchainBlockRepository.create({
      network: this.config.blockchain.unique.network,
      block_number: blockNumber.toString(),
      created_at: new Date(),
    });

    await this.connection.createQueryBuilder().insert().into(BlockchainBlock).values(block).orIgnore().execute();

    this.logger.debug(`Token transfer block number: ${block.block_number}`);

    const checkOwner = await this.checkOwner(+collectionId, +tokenId);
    if (!checkOwner) {
      this.sentryService.message('the token does not belong to the auction');
      throw new BadRequestException({
        statusCode: HttpStatus.CONFLICT,
        messsage: 'The token does not belog to the auction',
      });
    }

    const offer = await this.createAuctionBroadcast({
      blockNumber: block.block_number,
      collectionId: collectionId.toString(),
      tokenId: tokenId.toString(),
      ownerAddress: addressFrom,
      priceStep,
      startPrice,
      stopAt,
    });

    return offer;
  }

  /**
   * Create ask and broadcast it
   * @param data
   */
  async createAuctionBroadcast(data: CreateAuctionAndBroadcastArgs): Promise<OfferEntityDto> {
    const { blockNumber, collectionId, tokenId, ownerAddress, startPrice, priceStep, stopAt } = data;

    const newAuction = this.offersEntityRepository.create({
      id: uuid(),
      type: 'Auction',
      block_number_ask: blockNumber,
      network: this.config.blockchain.unique.network,
      collection_id: collectionId,
      token_id: tokenId,
      address_from: encodeAddress(ownerAddress),
      address_to: encodeAddress(this.auctionCredentials.uniqueAddress),
      status: ASK_STATUS.ACTIVE, // todo - add appropriate status
      price: startPrice.toString(),
      currency: '',
      stopAt,
      status_auction: AuctionStatus.active,
      startPrice: startPrice.toString(),
      priceStep: priceStep.toString(),
    });

    const newOffer = await this.offersEntityRepository.save(newAuction);
    const offer = OfferEntityDto.fromOffersEntity(newAuction);

    const getAcutionDto = (offer: OffersEntity): AuctionDto => ({
      id: offer.id,
      createdAt: offer.created_at,
      updatedAt: offer.updated_at,
      priceStep: offer.priceStep,
      startPrice: offer.startPrice,
      status: offer.status_auction as AuctionStatus,
      stopAt: offer.stopAt,
    });

    offer.auction = offer?.auction || getAcutionDto(newOffer);

    const searchIndex = await this.searchIndexService.addSearchIndexIfNotExists({
      collectionId: Number(collectionId),
      tokenId: Number(tokenId),
    });

    offer.tokenDescription = getTokenDescription(searchIndex, collectionId, tokenId);

    this.broadcastService.sendAuctionStarted(offer);

    const auctionCreatedData = {
      subject: 'Create auction',
      message: `Auction created for collectionId: ${collectionId} tokenId: ${tokenId}`,
      thread: 'auction',
      collection: collectionId,
      token: tokenId,
      price: startPrice.toString(),
      block: blockNumber,
      stopAt: `${stopAt}`,
      startPrice: startPrice.toString(),
      priceStep: priceStep.toString(),
      status_auction: 'ACTIVE',
      address_from: ownerAddress,
    };
    this.logger.debug(JSON.stringify(auctionCreatedData));

    return offer;
  }

  /**
   * Create failed auction
   * @param args
   */
  async saveFailedAuction(args: FailedAuctionArgs): Promise<void> {
    await this.offersEntityRepository.save({
      id: uuid(),
      type: 'Auction',
      collection: args.collectionId,
      token: args.tokenId,
      created_at_ask: new Date(),
      updated_at: new Date(),
      priceStep: args.priceStep.toString(),
      startPrice: args.startPrice.toString(),
      status_auction: AuctionStatus.failed,
      stopAt: new Date(),
      bids: [],
    });
  }

  public get isConnected(): boolean {
    return true;
  }
}
