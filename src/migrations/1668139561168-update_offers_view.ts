import { MigrationInterface, QueryRunner } from 'typeorm';

export class updateOffersView1668139561168 implements MigrationInterface {
  name = 'updateOffersView1668139561168';

  public async up(queryRunner: QueryRunner): Promise<void> {
  //   await queryRunner.query(`DROP VIEW "v_offers_search"`);
  //   await queryRunner.query(`CREATE VIEW "v_offers_search" AS  SELECT DISTINCT offer.id AS offer_id,
  //   offer.status AS offer_status,
  //   offer.type AS offer_type,
  //   offer.network AS offer_network,
  //   offer.price AS offer_price,
  //   offer.currency AS offer_currency,
  //   offer.address_from AS offer_address_from,
  //   offer.address_to AS offer_address_to,
  //   offer.block_number_ask AS offer_block_number_ask,
  //   offer.block_number_cancel AS offer_block_number_cancel,
  //   offer.block_number_buy AS offer_block_number_buy,
  //   offer.created_at_ask AS offer_created_at_ask,
  //   offer.updated_at AS offer_updated_at,
  //   offer."copiesCount" AS offer_copies_count,
  //   offer.id AS auction_id,
  //   offer.created_at_ask AS auction_created_at,
  //   offer.updated_auction AS auction_updated_at,
  //   offer.price_step AS auction_price_step,
  //   offer.start_price AS auction_start_price,
  //   offer.status AS auction_status,
  //   offer.stop_at AS auction_stop_at,
  //   bid.bidder_address AS auction_bidder_address,
  //   search_filter.collection_id,
  //   search_filter.network,
  //   search_filter.token_id,
  //   search_filter.is_trait,
  //   search_filter.locale,
  //   search_filter.traits,
  //   search_filter.key,
  //   search_filter.count_item,
  //   search_filter.total_items,
  //   search_filter.list_items
  //  FROM offers offer
  //    LEFT JOIN ( SELECT sf.collection_id,
  //           sf.network,
  //           sf.token_id,
  //           sf.is_trait,
  //           sf.locale,
  //           unnest(sf.items) AS traits,
  //           sf.key,
  //           sf.count_item,
  //           sf.total_items,
  //           sf.list_items
  //          FROM search_index sf
  //         WHERE sf.type <> 'ImageURL'::search_index_type_enum) search_filter ON offer.network::text = search_filter.network::text AND offer.collection_id = search_filter.collection_id AND offer.token_id = search_filter.token_id
  //    LEFT JOIN auction_bids bid ON bid.auction_id = offer.id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  //   await queryRunner.query(`DROP VIEW "v_offers_search"`);
  //   await queryRunner.query(`CREATE VIEW "v_offers_search" AS  SELECT DISTINCT offer.id AS offer_id,
  //   offer.status AS offer_status,
  //   offer.type AS offer_type,
  //   offer.network AS offer_network,
  //   offer.price AS offer_price,
  //   offer.currency AS offer_currency,
  //   offer.address_from AS offer_address_from,
  //   offer.address_to AS offer_address_to,
  //   offer.block_number_ask AS offer_block_number_ask,
  //   offer.block_number_cancel AS offer_block_number_cancel,
  //   offer.block_number_buy AS offer_block_number_buy,
  //   offer.created_at_ask AS offer_created_at_ask,
  //   offer.updated_at AS offer_updated_at,
  //   offer.id AS auction_id,
  //   offer.created_at_ask AS auction_created_at,
  //   offer.updated_auction AS auction_updated_at,
  //   offer.price_step AS auction_price_step,
  //   offer.start_price AS auction_start_price,
  //   offer.status AS auction_status,
  //   offer.stop_at AS auction_stop_at,
  //   bid.bidder_address AS auction_bidder_address,
  //   search_filter.collection_id,
  //   search_filter.network,
  //   search_filter.token_id,
  //   search_filter.is_trait,
  //   search_filter.locale,
  //   search_filter.traits,
  //   search_filter.key,
  //   search_filter.count_item,
  //   search_filter.total_items,
  //   search_filter.list_items
  //  FROM offers offer
  //    LEFT JOIN ( SELECT sf.collection_id,
  //           sf.network,
  //           sf.token_id,
  //           sf.is_trait,
  //           sf.locale,
  //           unnest(sf.items) AS traits,
  //           sf.key,
  //           sf.count_item,
  //           sf.total_items,
  //           sf.list_items
  //          FROM search_index sf
  //         WHERE sf.type <> 'ImageURL'::search_index_type_enum) search_filter ON offer.network::text = search_filter.network::text AND offer.collection_id = search_filter.collection_id AND offer.token_id = search_filter.token_id
  //    LEFT JOIN auction_bids bid ON bid.auction_id = offer.id`);
  }
}
