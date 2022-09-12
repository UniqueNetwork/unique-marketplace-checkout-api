import { BadRequestException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { DataSource, FindOperator, Not, Repository } from 'typeorm';
import { encodeAddress } from '@polkadot/util-crypto';
import { KeyringProvider } from '@unique-nft/accounts/keyring';
import { SignatureType } from '@unique-nft/accounts';

import { AuctionBidEntity, BlockchainBlock, OffersEntity } from '@app/entity';
import { MarketConfig } from '@app/config';
import { OfferEntityDto } from '@app/offers/dto/offer-dto';
import { ASK_STATUS } from '@app/escrow/constants';

import { DatabaseHelper } from './helpers/database-helper';
import { AuctionStatus, BidStatus } from '@app/types';
import { InjectSentry, SentryService } from '@app/utils/sentry';
import { InjectUniqueSDK } from '@app/uniquesdk';
import { SdkProvider } from '../../uniquesdk/sdk-provider';

type AuctionCancelArgs = {
  collectionId: number;
  tokenId: number;
  ownerAddress: string;
};

export class AuctionCancelingService {
  private readonly logger = new Logger(AuctionCancelingService.name);
  private readonly blockchainBlockRepository: Repository<BlockchainBlock>;
  private readonly offersRepository: Repository<OffersEntity>;

  constructor(
    private connection: DataSource,
    @Inject('CONFIG') private config: MarketConfig,
    @InjectSentry() private readonly sentryService: SentryService,
    @InjectUniqueSDK() private readonly uniqueProvider: SdkProvider,
  ) {
    this.offersRepository = connection.getRepository(OffersEntity);
    this.blockchainBlockRepository = connection.getRepository(BlockchainBlock);
  }

  /**
   * Try Cancel Auction
   * @param args
   */
  async tryCancelAuction(args: AuctionCancelArgs): Promise<OfferEntityDto> {
    let cancelledOffers: OffersEntity;

    try {
      cancelledOffers = await this.cancelInDatabase(args);

      return OfferEntityDto.fromOffersEntity(cancelledOffers);
    } catch (error) {
      throw new BadRequestException(error.message);
    } finally {
      if (cancelledOffers) await this.sendTokenBackToOwner(cancelledOffers);
    }
  }

  /**
   * Cancel auction in database
   * @param args
   * @private
   */
  private cancelInDatabase(args: AuctionCancelArgs): Promise<OffersEntity> {
    const { collectionId, tokenId, ownerAddress } = args;

    return this.connection.transaction<OffersEntity>('REPEATABLE READ', async (transactionEntityManager) => {
      const databaseHelper = new DatabaseHelper(transactionEntityManager);
      const auctionData = await databaseHelper.getActiveAuction({ collectionId, tokenId });

      if (auctionData.address_from !== encodeAddress(ownerAddress)) {
        this.logger.error(`You are not an owner. Owner is ${auctionData.address_from}, your address is ${ownerAddress}`);
        throw new Error(`You are not an owner. Owner is ${auctionData.address_from}, your address is ${ownerAddress}`);
      }

      const status = Not(BidStatus.error) as FindOperator<BidStatus> & BidStatus;
      const bidsCount = await transactionEntityManager.count(AuctionBidEntity, {
        where: { auctionId: auctionData.id, status: status },
      });

      if (bidsCount !== 0) {
        this.logger.error(`Unable to cancel auction, ${bidsCount} bids is placed already`);
        throw new Error(`Unable to cancel auction, ${bidsCount} bids is placed already`);
      }

      auctionData.status = ASK_STATUS.CANCELLED;
      await transactionEntityManager.update(OffersEntity, auctionData.id, {
        status: ASK_STATUS.CANCELLED,
        stopAt: new Date(),
        status_auction: AuctionStatus.ended,
      });
      this.logger.debug(`Update offer id:${auctionData.id}  status: 'CANCELLED' `);

      const canceledAuctionLog = {
        subject: 'Canceled auction',
        message: `Auction ${auctionData.id} was canceled`,
        collection: collectionId,
        token: tokenId,
        status_auction: AuctionStatus.ended,
        stopAt: new Date(),
        bidsCount: bidsCount,
        address_from: auctionData.address_from,
        ownerAddress: ownerAddress,
      };

      this.logger.debug(JSON.stringify(canceledAuctionLog));
      return auctionData;
    });
  }

  /**
   * Send Token to Owner
   * @param {OffersEntity} OffersEntity
   */
  async sendTokenBackToOwner(OffersEntity: OffersEntity): Promise<void> {
    try {
      const { address_from, collection_id, token_id } = OffersEntity;

      const auctionAccount = new KeyringProvider({ type: SignatureType.Sr25519 }).addSeed(this.config.auction.seed);

      const { blockNumber, blockHash, isError } = await this.uniqueProvider.transferService.transferToken(
        auctionAccount,
        address_from,
        parseInt(collection_id),
        parseInt(token_id),
      );

      if (isError) {
        this.logger.warn(`Failed at block # ${blockNumber} (${blockHash.toHex()})`);
        throw new BadRequestException({
          statusCode: HttpStatus.CONFLICT,
          message: `Failed at block # ${blockNumber} (${blockHash.toHex()})`,
        });
      }

      if (blockNumber === undefined || blockNumber === null || blockNumber.toString() === '0') {
        this.sentryService.message('sendTokenBackToOwner');
        throw new Error('Block number is not defined');
      }

      const block = this.blockchainBlockRepository.create({
        network: this.config.blockchain.unique.network,
        block_number: blockNumber.toString(),
        created_at: new Date(),
      });

      OffersEntity.block_number_cancel = block.block_number;
      OffersEntity.status_auction = AuctionStatus.ended;

      await this.connection.createQueryBuilder().insert().into(BlockchainBlock).values(block).orIgnore().execute();
      await this.offersRepository.save(OffersEntity);

      const sendTokenDataLog = {
        subject: 'Send token back to owner',
        thread: 'auction canceling',
        address_from: address_from,
        address_from_n42: encodeAddress(address_from),
        collection: collection_id,
        token: token_id,
        auction_seed: auctionAccount.instance.address,
        auction_seed_n42: encodeAddress(auctionAccount.instance.address),
        network: this.config.blockchain.unique.network,
        block_number: block.block_number,
      };

      this.logger.debug(JSON.stringify(sendTokenDataLog));
    } catch (error) {
      this.logger.error(error);
    }
  }
}
