import { MigrationInterface, QueryRunner, Table } from 'typeorm';



export class UpdatedSearchIndex_2022090100000000 implements MigrationInterface {
  name = 'UpdatedSearchIndex_2022090100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "search_index" ADD "nested" jsonb DEFAULT '{}'`);    
    await queryRunner.query(`ALTER TABLE "tokens" ADD "nested" jsonb DEFAULT '{}'`);    
  }
  async down(queryRunner: QueryRunner): Promise<void> {}
}