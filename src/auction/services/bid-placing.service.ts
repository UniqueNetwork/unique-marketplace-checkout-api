import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { stringify } from '@polkadot/util';
import { v4 as uuid } from 'uuid';
import { encodeAddress } from '@polkadot/util-crypto';

import { BroadcastService } from '@app/broadcast/services/broadcast.service';
import { MONEY_TRANSFER_STATUS, MONEY_TRANSFER_TYPES } from '@app/escrow/constants';
import { AuctionBidEntity, MoneyTransfer, OffersEntity } from '@app/entity';

import { OfferEntityDto } from '@app/offers/dto/offer-dto';
import { AuctionStatus, BidStatus, CalculateArgs, CalculationInfo, PlaceBidArgs } from '@app/types';
import { DatabaseHelper } from './helpers/database-helper';
import { PlaceBidRequestDto } from '../requests/place-bid';
import { InjectKusamaSDK } from '@app/uniquesdk';
import { SdkProvider } from '../../uniquesdk/sdk-provider';

@Injectable()
export class BidPlacingService {
  private readonly logger = new Logger(BidPlacingService.name);

  private bidRepository: Repository<AuctionBidEntity>;
  private offersRepository: Repository<OffersEntity>;
  private moneyTransferRepository: Repository<MoneyTransfer>;

  constructor(
    private connection: DataSource,
    @InjectKusamaSDK() private readonly kusamaProvider: SdkProvider,
    private broadcastService: BroadcastService,
  ) {
    this.offersRepository = connection.manager.getRepository(OffersEntity);
    this.bidRepository = connection.manager.getRepository(AuctionBidEntity);
    this.moneyTransferRepository = connection.getRepository(MoneyTransfer);
  }

  /**
   * @async
   * Places bid for auction
   * @description Data is build via SDK, signature is created and signerPayloadJSON
   * @param placeBidArgs
   * @returns {Promise<OfferEntityDto>}
   */
  async placeBid(placeBidArgs: PlaceBidRequestDto): Promise<OfferEntityDto> {
    let offers: OffersEntity;
    let nextUserBid: AuctionBidEntity;
    // Validate auction
    await this.checkActiveAuction(placeBidArgs?.tokenId.toString(), placeBidArgs?.collectionId.toString());
    const {
      blockNumber,
      isCompleted,
      isError,
      transferData: { sender, amount },
    } = await this.kusamaProvider.transferService.transferBalance(placeBidArgs.signerPayloadJSON, placeBidArgs.signature);

    const bidArgs = {
      collectionId: placeBidArgs.collectionId,
      tokenId: placeBidArgs.tokenId,
      bidderAddress: sender,
      amount: amount.toString(),
      signature: placeBidArgs.signature,
    };

    const info = await this.getCalculationInfo(bidArgs);

    if (BigInt(amount) < info[0].minBidderAmount) {
      throw new BadRequestException(`Minimum bet ${info[0].minBidderAmount}`);
    }

    try {
      [offers, nextUserBid] = await this.tryPlacePendingBid(bidArgs);
      return OfferEntityDto.fromOffersEntity(offers);
    } catch (error) {
      this.logger.warn(error);
      throw new BadRequestException(error.message);
    } finally {
      if (offers && nextUserBid) {
        if (isCompleted && !isError) {
          this.broadcastService.sendBidPlaced(OfferEntityDto.fromOffersEntity(offers));
          await this.handleBidTxSuccess(bidArgs, offers, nextUserBid, blockNumber);
        } else {
          this.broadcastService.sendAuctionError(OfferEntityDto.fromOffersEntity(offers), 'Bid is not finished');
          await this.handleBidTxFail(bidArgs, offers, nextUserBid);
        }
      }
    }
  }

  /**
   * @async
   * @param placeBidArgs
   * @param oldOffer
   * @param userBid
   * @param blockNumber
   * @private
   */
  private async handleBidTxSuccess(
    placeBidArgs: PlaceBidArgs,
    oldOffer: OffersEntity,
    userBid: AuctionBidEntity,
    blockNumber: bigint,
  ): Promise<void> {
    try {
      await this.bidRepository.update(userBid.id, {
        status: BidStatus.finished,
        blockNumber: blockNumber.toString(),
      });
      await this.moneyTransferRepository.save({
        id: uuid(),
        amount: placeBidArgs.amount,
        block_number: blockNumber.toString(),
        network: 'kusama',
        type: MONEY_TRANSFER_TYPES.DEPOSIT,
        status: MONEY_TRANSFER_STATUS.COMPLETED,
        created_at: new Date(),
        updated_at: new Date(),
        extra: { address: placeBidArgs.bidderAddress },
        currency: '2', // TODO: check this
      });
    } catch (error) {
      const fullError = {
        method: 'handleBidTxSuccess',
        message: error.message,
        placeBidArgs,
        oldOffer,
        userBid,
      };

      this.logger.error(JSON.stringify(fullError));
    }
  }

  /**
   * @async
   * @param placeBidArgs
   * @param oldOffer
   * @param userBid
   * @private
   */
  private async handleBidTxFail(placeBidArgs: PlaceBidArgs, oldOffer: OffersEntity, userBid: AuctionBidEntity): Promise<void> {
    const auctionId = oldOffer.id;
    try {
      await this.connection.transaction<void>('REPEATABLE READ', async (transactionEntityManager) => {
        const databaseHelper = new DatabaseHelper(transactionEntityManager);
        await transactionEntityManager.update(AuctionBidEntity, userBid.id, { status: BidStatus.error });

        const newWinner = await databaseHelper.getAuctionPendingWinner({ auctionId });
        const newOfferPrice = newWinner ? newWinner.totalAmount.toString() : oldOffer.startPrice;
        await transactionEntityManager.update(OffersEntity, oldOffer.id, { price: newOfferPrice });
      });
    } catch (error) {
      const fullError = {
        method: 'handleBidTxFail',
        message: error.message,
        placeBidArgs,
        oldOffer,
        userBid,
      };

      this.logger.error(JSON.stringify(fullError));
    }
  }

  /**
   * @async
   * @param calculateArgs
   * @param entityManager
   */
  getCalculationInfo(calculateArgs: CalculateArgs, entityManager?: EntityManager): Promise<[CalculationInfo, OffersEntity]> {
    const { collectionId, tokenId, bidderAddress } = calculateArgs;

    const calculate = async (entityManager: EntityManager): Promise<[CalculationInfo, OffersEntity]> => {
      const databaseHelper = new DatabaseHelper(entityManager);
      const auction = await databaseHelper.getActiveAuction({ collectionId, tokenId });

      const auctionId = auction.id;
      const price = BigInt(auction.price);
      const startPrice = BigInt(auction.startPrice);
      const priceStep = BigInt(auction.priceStep);

      const bidderPendingAmount = await databaseHelper.getUserPendingSum({
        auctionId: auction.id,
        bidderAddress,
      });

      let minBidderAmount = price - bidderPendingAmount;

      const isFirstBid = price === startPrice && (await databaseHelper.getAuctionPendingWinner({ auctionId })) === undefined;

      if (minBidderAmount > 0 && !isFirstBid) {
        minBidderAmount += priceStep;
      } else {
        // bidder is winner at the moment or this is first bid
      }

      return [
        {
          contractPendingPrice: price,
          priceStep,
          bidderPendingAmount,
          minBidderAmount,
        },
        auction,
      ];
    };

    return entityManager ? calculate(entityManager) : this.connection.transaction('REPEATABLE READ', calculate);
  }

  /**
   * @async
   * @param placeBidArgs
   * @private
   */
  private async tryPlacePendingBid(placeBidArgs: PlaceBidArgs): Promise<[OffersEntity, AuctionBidEntity]> {
    const { bidderAddress } = placeBidArgs;

    const placeWithTransaction = async (transactionEntityManager: EntityManager): Promise<[OffersEntity, AuctionBidEntity]> => {
      const databaseHelper = new DatabaseHelper(transactionEntityManager);

      const [calculationInfo, offers] = await this.getCalculationInfo(placeBidArgs, transactionEntityManager);
      const { minBidderAmount, bidderPendingAmount, priceStep, contractPendingPrice } = calculationInfo;
      const amount = BigInt(placeBidArgs.amount);

      this.logger.debug(`${this.tryPlacePendingBid.name}: ${stringify({ ...placeBidArgs, ...calculationInfo })}`);

      if (contractPendingPrice >= priceStep && amount < priceStep) {
        throw new BadRequestException(`Min price step is ${priceStep}`);
      }

      if (amount < minBidderAmount) {
        throw new BadRequestException({
          ...calculationInfo,
          amount,
          message: `Offered bid is not enough`,
        });
      }

      const userNextPendingAmount = bidderPendingAmount + amount;

      const nextUserBid = transactionEntityManager.create(AuctionBidEntity, {
        id: uuid(),
        status: BidStatus.minting,
        bidderAddress: encodeAddress(bidderAddress),
        amount: amount.toString(),
        balance: userNextPendingAmount.toString(),
        auctionId: offers.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      offers.price = userNextPendingAmount.toString();
      await transactionEntityManager.update(OffersEntity, offers.id, {
        price: userNextPendingAmount.toString(),
      });

      await transactionEntityManager.save(AuctionBidEntity, nextUserBid);

      offers.bids = await databaseHelper.getBids({ auctionId: offers.id });

      return [offers, nextUserBid];
    };

    return this.connection.transaction<[OffersEntity, AuctionBidEntity]>('REPEATABLE READ', placeWithTransaction);
  }

  /**
   * @async
   * @param collectionId
   * @param tokenId
   * @param bidderAddress
   * @private
   */
  private async getBidsBalance(collectionId: number, tokenId: number, bidderAddress: string) {
    const bids = await this.bidRepository
      .createQueryBuilder('bids')
      .leftJoinAndSelect('offers', 'offer', 'offer.id = bids.auctionId')
      .where('bids.bidderAddress = :bidderAddress', { bidderAddress: encodeAddress(bidderAddress) })
      .andWhere('offer.status_auction = :auctionsStatus', { auctionsStatus: AuctionStatus.active })
      .andWhere('offer.collection_id = :collectionId', { collectionId })
      .andWhere('offer.token_id = :tokenId', { tokenId })
      .getMany();

    return bids.reduce((acc, bid) => acc + BigInt(bid.balance), BigInt(0));
  }

  /**
   * Check auction status
   * @param {string} tokenId
   * @param {string} collectionId
   * @private
   */
  private async checkActiveAuction(tokenId: string, collectionId: string) {
    const auction = await this.offersRepository.findOne({
      where: { token_id: tokenId, collection_id: collectionId, status: 'active', type: 'Auction' },
    });
    if (!auction) {
      throw new NotFoundException('Auction not found');
    }
  }
}
