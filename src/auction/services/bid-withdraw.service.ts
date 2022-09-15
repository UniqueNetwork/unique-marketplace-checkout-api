import { BadRequestException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { encodeAddress } from '@polkadot/util-crypto';

import { AuctionBidEntity, MoneyTransfer, OffersEntity } from '@app/entity';
import { MONEY_TRANSFER_STATUS, MONEY_TRANSFER_TYPES } from '@app/escrow/constants';
import { InjectSentry, SentryService } from '@app/utils/sentry';
import { SdkExtrinsicService, NetworkName, InjectKusamaSDK } from '@app/uniquesdk';

import { BidStatus, SellingMethod } from '@app/types';
import { DatabaseHelper } from './helpers/database-helper';
import { AuctionCredentials } from '../providers';
import { BidsWitdrawByOwner, BidsWithdraw } from '../responses';

type BidWithdrawArgs = {
  collectionId: number;
  tokenId: number;
  bidderAddress: string;
};

type BidsWirthdrawArgs = {
  bidderAddress: string;
  auctionIds: Array<string>;
};

@Injectable()
export class BidWithdrawService {
  private readonly logger = new Logger(BidWithdrawService.name);

  private readonly bidRepository: Repository<AuctionBidEntity>;

  private moneyTransferRepository: Repository<MoneyTransfer>;

  constructor(
    private connection: DataSource,
    @InjectKusamaSDK() private kusamaApi,
    @Inject('AUCTION_CREDENTIALS') private auctionCredentials: AuctionCredentials,
    private readonly sdkExtrinsicService: SdkExtrinsicService,
    @InjectSentry() private readonly sentryService: SentryService,
  ) {
    this.bidRepository = connection.manager.getRepository(AuctionBidEntity);
    this.moneyTransferRepository = connection.getRepository(MoneyTransfer);
  }

  async withdrawBidByBidder(args: BidWithdrawArgs): Promise<void> {
    let withdrawingBid: AuctionBidEntity;

    try {
      withdrawingBid = await this.tryCreateWithdrawingBid(args);

      return '' as any;
    } catch (error) {
      throw new BadRequestException(error.message);
    } finally {
      if (withdrawingBid) {
        await this.makeWithdrawalTransfer(withdrawingBid);
      }
    }
  }

  async withdrawByMarket(auction: OffersEntity, bidderAddress: string, amount: bigint): Promise<void> {
    const withdrawingBid = this.connection.manager.create(AuctionBidEntity, {
      id: uuid(),
      status: BidStatus.minting,
      bidderAddress: encodeAddress(bidderAddress),
      amount: (-1n * amount).toString(),
      balance: '0',
      auctionId: auction.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.connection.manager.save(withdrawingBid);

    await this.makeWithdrawalTransfer(withdrawingBid);
  }

  /**
   * Make withdrawal transfer for bid
   * @param withdrawingBid
   */
  async makeWithdrawalTransfer(withdrawingBid: AuctionBidEntity): Promise<void> {
    const auctionKeyring = this.auctionCredentials.keyring;
    const amount = BigInt(withdrawingBid.amount) * -1n;

    const nonce = await this.kusamaApi.api.rpc.system.accountNextIndex(auctionKeyring.address);

    const tx = await this.kusamaApi.api.tx.balances
      .transferKeepAlive(withdrawingBid.bidderAddress, amount)
      .signAsync(auctionKeyring, { nonce });

    await this.sdkExtrinsicService
      .submit(tx, NetworkName.KUSAMA)
      .then(async ({ blockNumber }) => {
        await this.bidRepository.update(withdrawingBid.id, {
          status: BidStatus.finished,
          blockNumber: blockNumber.toString(),
        });
        this.logger.debug(
          `Bid make Withdraw transfer id: ${withdrawingBid.id},  status: ${BidStatus.finished}, blockNumber: ${blockNumber.toString()} `,
        );
        await this.moneyTransferRepository.save({
          id: uuid(),
          amount: `${amount}`,
          block_number: `${blockNumber}`,
          network: 'kusama',
          type: MONEY_TRANSFER_TYPES.WITHDRAW,
          status: MONEY_TRANSFER_STATUS.COMPLETED,
          created_at: new Date(),
          updated_at: new Date(),
          extra: { address: withdrawingBid.bidderAddress },
          currency: '2', // TODO: check this
        });
      })
      .catch(async (error) => {
        const fullError = {
          method: 'makeWithdrawalTransfer',
          message: error.message,
          withdrawingBid,
        };

        this.logger.error(JSON.stringify(fullError));

        await this.bidRepository.update(withdrawingBid.id, { status: BidStatus.error });
        await this.moneyTransferRepository.save({
          id: uuid(),
          amount: `-${amount}`,
          block_number: `${withdrawingBid.blockNumber}`,
          network: 'kusama',
          type: MONEY_TRANSFER_TYPES.DEPOSIT,
          status: MONEY_TRANSFER_STATUS.FAILED,
          created_at: new Date(),
          updated_at: new Date(),
          extra: { address: withdrawingBid.bidderAddress },
          currency: '2', // TODO: check this
        });
      });
  }

  // todo - unite into single method with withdrawByMarket?
  /**
   * Create withdrawing bid for bidder
   * @param args
   * @private
   */
  private async tryCreateWithdrawingBid(args: BidWithdrawArgs): Promise<AuctionBidEntity> {
    const { collectionId, tokenId, bidderAddress } = args;

    return this.connection.transaction<AuctionBidEntity>('REPEATABLE READ', async (transactionEntityManager) => {
      const databaseHelper = new DatabaseHelper(transactionEntityManager);

      const auction = await databaseHelper.getActiveAuction({ collectionId, tokenId });
      const auctionId = auction.id;
      const bidderActualSum = await databaseHelper.getUserActualSum({ auctionId, bidderAddress });
      const bidderPendingSum = await databaseHelper.getUserPendingSum({ auctionId, bidderAddress });

      if (bidderActualSum <= 0) {
        this.logger.error(`Failed to create withdrawal, all minted bids sum is ${bidderActualSum} for ${bidderAddress}`);
        throw new Error(`Failed to create withdrawal, all minted bids sum is ${bidderActualSum} for ${bidderAddress}`);
      }

      const pendingWinner = await databaseHelper.getAuctionPendingWinner({ auctionId });

      if (pendingWinner && pendingWinner.bidderAddress === bidderAddress) {
        this.logger.error(`You are going to be winner, please wait your bid to be overbidden `);
        throw new Error(`You are going to be winner, please wait your bid to be overbidden`);
      }

      const actualWinner = await databaseHelper.getAuctionCurrentWinner({ auctionId });

      if (actualWinner && actualWinner.bidderAddress === bidderAddress) {
        this.logger.error(`You are winner at this moment, please wait your bid to be overbidden`);
        throw new Error(`You are winner at this moment, please wait your bid to be overbidden`);
      }

      const withdrawingBid = transactionEntityManager.create(AuctionBidEntity, {
        id: uuid(),
        status: BidStatus.minting,
        bidderAddress: encodeAddress(bidderAddress),
        amount: (-1n * bidderActualSum).toString(),
        balance: (bidderPendingSum - bidderActualSum).toString(),
        auctionId: auction.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await transactionEntityManager.save(withdrawingBid);
      const bidTransaction = {
        subject: 'Transaction bid',
        thread: 'bid-withdraw',
        status: BidStatus.minting,
        bidderAddress: bidderAddress,
        bidderAddress_n42: encodeAddress(bidderAddress),
        amount: (-1n * bidderActualSum).toString(),
        balance: (bidderPendingSum - bidderActualSum).toString(),
        auctionId: auction.id,
        log: 'tryCreateWithdrawingBid',
      };
      this.logger.debug(JSON.stringify(bidTransaction));
      return withdrawingBid;
    });
  }

  /**
   * Get bids for withdrawing
   * @param owner
   * @private
   */
  private async _getBidsForWithdraw(owner: string): Promise<Array<BidsWitdrawByOwner>> {
    const results = await this.connection.manager.query(
      `
      with my_list_auction as (
        select auction_id from auction_bids where bidder_address = $1
        group by auction_id
    ),
    sum_amount_auctions as (
        select distinct b.auction_id, bidder_address, sum(amount) over (partition by bidder_address, b.auction_id) sum_amount
        from auction_bids b inner join  my_list_auction my on my.auction_id = b.auction_id
    ),
    my_withdraws as (
        select auction_id, bidder_address, sum_amount amount, rank() over (partition by auction_id order by sum_amount desc ) rank
        from sum_amount_auctions
    )
    select distinct  auction_id "auctionId", amount, collection_id "collectionId", token_id "tokenId" from my_withdraws
    inner join offers ca on ca.id = auction_id
    where rank <> 1 and amount > 0 and bidder_address = $1
      `,
      [owner],
    );
    return results;
  }

  /**
   * Get Leader bids
   * @param {String} owner - owner address
   * @private
   */
  private async _getLeaderBids(owner: string): Promise<Array<BidsWitdrawByOwner>> {
    const results = await this.connection.manager.query(
      `
     with auctions_data as (
      select *, rank() over (partition by auction_id order by sum_amount desc) rank
      from (
               select distinct auction_id,bidder_address,collection_id, token_id, sum(amount) over (partition by bidder_address, auction_id) sum_amount
                from auction_bids bids
                left join offers a on bids.auction_id = a.id
               where a.status_auction in ('active', 'created')
           ) temp
      )
    select auction_id "auctionId", sum_amount amount, collection_id "collectionId", token_id "tokenId"
    from auctions_data
    where rank = 1 and bidder_address = $1
    `,
      [owner],
    );
    return results;
  }

  /**
   * Get bids for withdrawing
   * @param owner
   * @returns {Promise<Array<BidsWitdrawByOwner>>}
   */
  async getBidsForWithdraw(owner: string): Promise<BidsWithdraw> {
    let bidsWithdraw = [];
    let leaderBids = [];

    try {
      bidsWithdraw = await this._getBidsForWithdraw(owner);
      leaderBids = await this._getLeaderBids(owner);
    } catch (e) {
      this.logger.error(e);
      this.sentryService.instance().captureException(new BadRequestException(e), {
        tags: { section: 'get_bids_withdraw' },
      });
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Bad query',
        error: e.message,
      });
    }
    return {
      leader: leaderBids,
      withdraw: bidsWithdraw,
    };
  }

  /**
   * Withdraw bids for user
   * @param args
   */
  async withdrawBidsByBidder(args: BidsWirthdrawArgs): Promise<void> {
    const query = this.connection
      .createQueryBuilder(OffersEntity, 'offerAuction')
      .select(['collection_id', 'token_id'])
      .andWhere('offerAuction.id in (:...auctionIds)', { auctionIds: args.auctionIds })
      .andWhere('offerAuction.type = :type', { type: SellingMethod.Auction })
      .distinct();

    for (const item of await query.execute()) {
      await this.withdrawBidByBidder({
        bidderAddress: args.bidderAddress,
        collectionId: item.collection_id,
        tokenId: item.token_id,
      });
    }
  }
}
