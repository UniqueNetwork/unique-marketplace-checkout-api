import { MigrationInterface, QueryRunner } from 'typeorm';

export class LazyPayToken_2207319000001 implements MigrationInterface {

  name = 'LazyPayToken_2207319000001';
  public async up(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(`ALTER TABLE public.offers ADD "copiesCount" int8 NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(`ALTER TABLE public.offers DROP COLUMN "copiesCount"`);
  }
}
