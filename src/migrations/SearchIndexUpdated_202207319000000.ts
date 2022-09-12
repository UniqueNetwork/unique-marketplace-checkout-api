import { SearchIndex } from './../entity/search-index';
import { MigrationInterface, QueryRunner, Table } from 'typeorm';



export class SearchIndexUpdated_202207319000000 implements MigrationInterface {
  name = 'SearchIndexUpdated_202207319000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (let tokens of await queryRunner.query(`select distinct collection_id, token_id from search_index where total_items is null`)) {
      await queryRunner.query(`
      update search_index
        set total_items = _total.total_items
      from (
      select distinct total_items, collection_id, token_id from search_index
          where collection_id = ${tokens.collection_id} and token_id = ${tokens.token_id}
          and total_items is not null
      ) _total
      where search_index.collection_id = _total.collection_id
      and search_index.token_id = _total.token_id
      and search_index.total_items is null`);
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {}
}