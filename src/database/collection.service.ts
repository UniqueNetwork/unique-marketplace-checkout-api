import { CollectionImportType } from '@app/admin/types';
import { Collection } from '@app/entity';
import { DecodedCollection } from '@app/types';
import { Injectable, Logger } from '@nestjs/common';
import { CollectionInfoWithSchema, CollectionMode } from '@unique-nft/substrate-client/tokens';
import { yellow, red } from 'cli-color';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class CollectionService {
  private collectionRepository: Repository<Collection>;
  private logger: Logger;

  constructor(private connection: DataSource) {
    this.collectionRepository = this.connection.getRepository(Collection);
    this.logger = new Logger(CollectionService.name, { timestamp: true });
  }

  async collections(ids: Array<number>): Promise<Array<Collection>> {
    return this.collectionRepository.findByIds(ids);
  }

  async byId(id: number): Promise<Collection> {
    return await this.collectionRepository.findOne({
      where: {
        id: id.toString(),
      },
    });
  }
  // TODO: Added return type for different situations
  /**
   * If collection already exists in database - update record
   * If collection not found in chain its created with empty data
   * @param {CollectionInfoWithSchema} collection collection info
   * @returns boolean
   */
  async save(collection: CollectionInfoWithSchema): Promise<boolean> {
    try {
      const decoded: DecodedCollection = {
        owner: collection?.owner,
        mode: collection?.mode as CollectionMode,
        tokenPrefix: collection?.tokenPrefix,
        name: collection?.name,
        description: collection?.description,
        importType: CollectionImportType.Api,
        data: collection as any,
      };
      const _collection = await this.collectionRepository.create(decoded);
      const existing = await this.byId(collection.id);

      if (existing) {
        try {
          await this.collectionRepository.save({ id: existing.id, ..._collection });
          return true;
        } catch (error) {
          this.logger.error(`Collection #${yellow(collection.id)} ${red('updating data error')}`);
          new Error(`Error while updating collection`);
          return false;
        }
      } else {
        try {
          await this.collectionRepository.save({ id: collection.id, ..._collection });
          return true;
        } catch (error) {
          console.error(error);
          this.logger.error(`Collection #${yellow(collection.id)} ${red('saving data error')}`);
          new Error(`Error while saving collection`);
          return false;
        }
      }
    } catch (error) {
      this.logger.error(`Collection #${yellow(collection.id)} ${red('saving data error')}`);
      new Error(`Error while saving collection`);
      return false;
    }
  }
}
