import { MigrationInterface, QueryRunner } from 'typeorm';

export class lazyPayToken1668054011132 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.offers ADD "copiesCount" int8 NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.offers DROP COLUMN "copiesCount"`);
  }
}
