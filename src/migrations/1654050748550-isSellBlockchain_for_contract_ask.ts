import { MigrationInterface, QueryRunner } from 'typeorm';

export class isSellBlockchainForContractAsk1654050748550 implements MigrationInterface {
  name = 'isSellBlockchainForContractAsk1654050748550';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contract_ask ADD is_sell_blockchain boolean NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE contract_ask ALTER COLUMN block_number_ask DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE contract_ask ALTER COLUMN address_to DROP NOT NULL`);
    // Up to this point, all records have been paid through the blockchain.
    await queryRunner.query(`UPDATE contract_ask SET is_sell_blockchain = TRUE`);
    await queryRunner.query(`ALTER TABLE contract_ask ALTER COLUMN id SET DEFAULT uuid_generate_v4()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contract_ask DROP COLUMN is_sell_blockchain`);
    await queryRunner.query(`ALTER TABLE public.contract_ask ALTER COLUMN id DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE public.contract_ask ALTER COLUMN block_number_ask SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE public.contract_ask ALTER COLUMN address_to SET NOT NULL`);
  }
}
