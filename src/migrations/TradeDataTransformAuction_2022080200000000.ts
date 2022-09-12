import { MigrationInterface, QueryRunner } from 'typeorm';

export class TradeDataTransformAuction_2022080200000000 implements MigrationInterface {
  name = 'TradeDataTransformAuction_2022080200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const marketTradeExits = await queryRunner.hasTable('market_trade');
    const contractAskExits = await queryRunner.hasTable('contract_ask');
    const auctionsExits = await queryRunner.hasTable('auctions');
    const bidsExits = await queryRunner.hasTable('bids');
    if (!marketTradeExits || !contractAskExits || !auctionsExits || !bidsExits) {
      return;
    }
    await queryRunner.query(
      `INSERT INTO market_trade (SELECT offers.ID,offers.collection_id,offers.token_id,offers.network,((offers.price*100)/110) :: BIGINT AS price,'0000000000000000000000000000000000000001' AS currency,offers.address_from AS address_seller,CASE WHEN auc.ID NOTNULL THEN bidd.bidder END AS address_buyer,auc.created_at AS ask_created_at,auc.stop_at AS buy_created_at,offers.block_number_ask,offers.block_number_buy,'Auction' AS "method",offers.price :: BIGINT AS origin_price,(offers.price-(offers.price*100)/110) :: BIGINT AS commission FROM contract_ask offers LEFT JOIN auctions auc ON auc.contract_ask_id=offers."id" LEFT JOIN (SELECT COUNT (*) AS num,auction_id,MAX (amount) AS max_amount,MAX (balance) AS balance,MAX (bidder_address) AS bidder FROM "bids" GROUP BY auction_id) AS "bidd" ON "bidd"."auction_id"="auc"."id" LEFT JOIN market_trade trade ON trade.block_number_ask=offers.block_number_ask AND trade.block_number_buy=offers.block_number_buy AND trade.token_id=offers.token_id AND trade.collection_id=offers.collection_id WHERE offers.status='bought' AND auc."id" NOTNULL AND trade.ID IS NULL AND offers.block_number_buy NOTNULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
