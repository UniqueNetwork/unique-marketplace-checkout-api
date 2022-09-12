import { MigrationInterface, QueryRunner } from 'typeorm';

export class TradeDataTransform_2022072800000000 implements MigrationInterface {
  name = 'TradeDataTransform_2022072800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const marketTradeExits = await queryRunner.hasTable('market_trade');
    const contractAskExits = await queryRunner.hasTable('contract_ask');
    const auctionsExits = await queryRunner.hasTable('auctions');
    const bidsExits = await queryRunner.hasTable('bids');
    if (!marketTradeExits || !contractAskExits || !auctionsExits || !bidsExits) {
      return
    }
    await queryRunner.query(`
    update
      public.market_trade
    set
      "method" = subq."method",
      origin_price = subq.origin_price,
      commission = subq.commission
    from
      (
      select
        trades.id,
        offer.collection_id,
        offer.token_id,
        offer."network",
        case
          when auction.ID notnull then
        'Auction'
          else 'FixedPrice'
        end as "method",
        offer.price :: BIGINT as origin_price,
        (offer.price - (offer.price * 100)/ 110) as commission
      from
        "public"."contract_ask" as "offer"
      left join "public"."auctions" as "auction" on
        "auction"."contract_ask_id" = "offer"."id"
      left join (
        select
          COUNT
        (*) as num,
          auction_id,
          MAX (amount) as max_amount,
          MAX (balance) as balance,
          MAX (bidder_address) as bidder
        from
          "bids"
        group by
          auction_id
      ) as "bidd" on
        "bidd"."auction_id" = "auction"."id"
      left join "public"."market_trade" as "trades" on
        "trades"."collection_id" = "offer"."collection_id"
        and "trades"."token_id" = "offer"."token_id"
        and "trades"."block_number_buy" = "offer"."block_number_buy"
      where
        offer.status = 'bought')
        as subq
    where
      market_trade.collection_id = subq.collection_id
      and market_trade.token_id = subq.token_id
      and market_trade."method" is null`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
