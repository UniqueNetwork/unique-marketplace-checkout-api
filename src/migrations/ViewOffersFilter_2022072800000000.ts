import { MigrationInterface, QueryRunner } from 'typeorm';

export class ViewOffersFilter_2022072800000000 implements MigrationInterface {
  name = 'ViewOffersFilter_2022072800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const marketTradeExits = await queryRunner.hasTable('market_trade');
    const contractAskExits = await queryRunner.hasTable('contract_ask');
    const auctionsExits = await queryRunner.hasTable('auctions');
    const bidsExits = await queryRunner.hasTable('bids');
    if (!marketTradeExits || !contractAskExits || !auctionsExits || !bidsExits) {
      return;
    }
    await queryRunner.query(`drop view if exists v_offers_search`);
    await queryRunner.query(
      `create or replace view "v_offers_search" AS select DISTINCT "offer"."id"                  AS "offer_id", "offer"."status"              AS "offer_status", "offer"."network"             AS "offer_network", "offer"."price"               AS "offer_price", "offer"."currency"            AS "offer_currency", "offer"."address_from"        AS "offer_address_from", "offer"."address_to"          AS "offer_address_to", "offer"."block_number_ask"    AS "offer_block_number_ask", "offer"."block_number_cancel" AS "offer_block_number_cancel", "offer"."block_number_buy"    AS "offer_block_number_buy", "offer"."created_at_ask"      AS "offer_created_at_ask", "offer"."updated_at"          AS "offer_updated_at", "auction"."id"                AS "auction_id", "auction"."created_at"        AS "auction_created_at", "auction"."updated_at"        AS "auction_updated_at", "auction"."price_step"        AS "auction_price_step", "auction"."start_price"       AS "auction_start_price", "auction"."status"            AS "auction_status", "auction"."stop_at"           AS "auction_stop_at", "auction"."contract_ask_id"   AS "auction_contract_ask_id", "auction"."bidder_address" as "auction_bidder_address", search_filter.* from "public"."contract_ask" "offer" left join (select collection_id, network, token_id, is_trait, locale, unnest(items) traits, key, count_item, total_items, list_items from "public"."search_index" "sf" where "sf"."type" not in ('ImageURL')) "search_filter" on "offer"."network" = search_filter.network and "offer"."collection_id" = search_filter.collection_id and "offer"."token_id" = search_filter.token_id left join "public".v_auction_bids auction ON auction.contract_ask_id = "offer"."id" where "offer"."status" in ('active', 'removed_by_admin')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop view if exists v_offers_search`);
    await queryRunner.query(
      `create or replace view "v_offers_search" AS select DISTINCT "offer"."id"                  AS "offer_id", "offer"."status"              AS "offer_status", "offer"."network"             AS "offer_network", "offer"."price"               AS "offer_price", "offer"."currency"            AS "offer_currency", "offer"."address_from"        AS "offer_address_from", "offer"."address_to"          AS "offer_address_to", "offer"."block_number_ask"    AS "offer_block_number_ask", "offer"."block_number_cancel" AS "offer_block_number_cancel", "offer"."block_number_buy"    AS "offer_block_number_buy", "offer"."created_at_ask"      AS "offer_created_at_ask", "offer"."updated_at"          AS "offer_updated_at", "auction"."id"                AS "auction_id", "auction"."created_at"        AS "auction_created_at", "auction"."updated_at"        AS "auction_updated_at", "auction"."price_step"        AS "auction_price_step", "auction"."start_price"       AS "auction_start_price", "auction"."status"            AS "auction_status", "auction"."stop_at"           AS "auction_stop_at", "auction"."contract_ask_id"   AS "auction_contract_ask_id", "offer".address_from as "auction_bidder_address", search_filter.* from "public"."contract_ask" "offer" left join (select collection_id, network, token_id, is_trait, locale, unnest(items) traits, key, count_item, total_items, list_items from "public"."search_index" "sf" where "sf"."type" not in ('ImageURL')) "search_filter" on "offer"."network" = search_filter.network and "offer"."collection_id" = search_filter.collection_id and "offer"."token_id" = search_filter.token_id left join "public".v_auction_bids auction ON auction.contract_ask_id = "offer"."id" where "offer"."status" = 'active'`,
    );
  }
}
