import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeTokenAndCollection1659606810000 implements MigrationInterface {
  name = 'ChangeTokenAndCollection1659606810000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" ADD "data" jsonb DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "tokens" ADD "data" jsonb DEFAULT '{}'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "data"`);
    await queryRunner.query(`ALTER TABLE "tokens" DROP COLUMN "data"`);
  }
}
