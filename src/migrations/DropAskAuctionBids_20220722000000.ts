import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class DropAskAuctionBids_20220722000000 implements MigrationInterface {
  name = 'DropAskAuctionBids_22072200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "v_auction_bids" cascade`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bids" cascade`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auctions" cascade`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contract_ask" cascade`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {}
}
