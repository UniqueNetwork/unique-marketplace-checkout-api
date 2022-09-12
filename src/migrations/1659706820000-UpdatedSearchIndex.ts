import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatedSearchIndex1659706820000 implements MigrationInterface {
  name = 'UpdatedSearchIndex1659706820000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "search_index" ADD "attributes" jsonb DEFAULT '{}'`);
    await queryRunner.query(`ALTER TYPE "search_index_type_enum" ADD VALUE 'VideoURL'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "attributes"`);    
  }
}
