import '@polkadot/api-augment/polkadot';
import { HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MarketConfig } from '@app/config';
import { DataSource, Repository } from 'typeorm';
import { green, red, yellow } from 'cli-color';
import { CollectionImportType, CollectionStatus, ImportByIdResult } from '../types';
import { CollectionsFilter, DisableCollectionResult, EnableCollectionResult, ListCollectionResult } from '../dto';
import { Collection, OffersEntity } from '@app/entity';
import { CollectionMode } from '@unique-nft/substrate-client/tokens';

import { DecodedCollection } from '@app/types';
import { CollectionService as CollectionDB } from '@app/database/collection.service';
import { InjectUniqueSDK } from '@app/uniquesdk';
import { SdkProvider } from '../../uniquesdk/sdk-provider';

@Injectable()
export class CollectionsService implements OnModuleInit {
  private readonly collectionsRepository: Repository<Collection>;
  private readonly offersRepository: Repository<OffersEntity>;
  private readonly logger: Logger;

  constructor(
    private connection: DataSource,
    private collectionDB: CollectionDB,
    @InjectUniqueSDK() private readonly uniqueProvider: SdkProvider,
    @Inject('CONFIG') private config: MarketConfig,
  ) {
    this.collectionsRepository = connection.getRepository(Collection);
    this.offersRepository = connection.getRepository(OffersEntity);
    this.logger = new Logger(CollectionsService.name, { timestamp: true });
  }

  /**
   * Import collections by ids concatiated between database and config
   */
  async onModuleInit(): Promise<void> {
    const idsFromConfig = this.config.blockchain.unique.collectionIds;

    const idsFromDatabase = await this.getCollectionIds();

    const collectionIds = [...new Set([...idsFromConfig, ...idsFromDatabase])];

    this.logger.log(`Import collection by ids ${yellow(collectionIds)} ...`);

    for (const collectionId of collectionIds) {
      const { message } = await this.importById(collectionId, CollectionImportType.Env);

      this.logger.log(message);
    }
  }

  /**
   * Import collection from unique network by collection id and save to database
   * If collection already exists in database - update record
   * If collection not found in chain its created with empty data
   * @param {Number} id - collection id from unique network
   * @param {CollectionImportType} importType - where the collection is imported from (Env/Api)
   * @return ({Promise<ImportByIdResult>})
   */
  async importById(id: number, importType: CollectionImportType): Promise<ImportByIdResult> {
    const collectionNew = await this.uniqueProvider.collectionsService.collectionById(id);
    const decoded: DecodedCollection = {
      owner: collectionNew?.owner,
      mode: collectionNew?.mode as CollectionMode,
      tokenPrefix: collectionNew?.tokenPrefix,
      name: collectionNew?.name,
      importType: CollectionImportType.Api,
      description: collectionNew?.description,
      data: collectionNew,
    };

    const entity = this.collectionsRepository.create(decoded);
    const existing = await this.collectionDB.byId(id);

    if (existing) {
      try {
        await this.collectionsRepository.save({ id: existing.id, ...entity });
      } catch (e) {
        this.logger.error(`Collection #${yellow(id)} ${red('updating data error')}`);
        new Error('Error while updating collection');
      }

      const collection = { ...existing, ...entity };

      return {
        collection,
        message: `Collection #${yellow(id)} ${green('already exists')} `,
      };
    } else {
      try {
        await this.collectionsRepository.save({ id, importType, ...entity });
      } catch (e) {
        this.logger.error(`Collection #${yellow(id)} ${red('updating data error')}`);
        new Error('Error while updating collection');
      }
      const collection = { ...existing, ...entity, importType };

      return {
        collection,
        message: `Collection #${yellow(id)} ${green('successfully created')} `,
      };
    }
  }

  /**
   * Enable collection by ID
   * @param {Number} id - collection id
   * @return ({Promise<EnableCollectionResult>})
   */
  async enableById(id: number): Promise<EnableCollectionResult> {
    const { collection } = await this.importById(id, CollectionImportType.Api);

    await this.collectionsRepository.update(id, { status: CollectionStatus.Enabled });
    await this.offersRepository.update({ collection_id: collection.id, status: 'removed_by_admin' }, { status: 'active' });
    const message =
      collection.status === CollectionStatus.Enabled ? `Collection #${id} has already enabled` : `Collection #${id} successfully enabled`;

    return {
      statusCode: HttpStatus.OK,
      message,
      data: { ...collection, status: CollectionStatus.Enabled },
    };
  }

  /**
   * Disable collection by ID
   * @param {Number} id - collection id
   * @return ({Promise<DisableCollectionResult>})
   */
  async disableById(id: number): Promise<DisableCollectionResult> {
    const collection = await this.collectionDB.byId(id);

    if (!collection) throw new NotFoundException(`Collection #${id} not found`);
    await this.offersRepository.update({ collection_id: collection.id, status: 'active' }, { status: 'removed_by_admin' });
    const message =
      collection.status === CollectionStatus.Disabled
        ? `Collection #${collection.id} has already disabled`
        : `Collection #${collection.id} successfully disabled`;

    await this.collectionsRepository.update(id, { status: CollectionStatus.Disabled });

    return {
      statusCode: HttpStatus.OK,
      message,
      data: { ...collection, status: CollectionStatus.Disabled },
    };
  }

  /**
   * Update allowed tokens for collection
   * @param {Number} id - id collection
   * @param {String} tokens - string data. Example: '2,17,21-42'
   * @return ({Promise<void>})
   */
  async updateAllowedTokens(id: number, tokens: string): Promise<void> {
    const collection = await this.collectionDB.byId(id);

    if (!collection) throw new NotFoundException(`Collection #${id} not found`);

    await this.collectionsRepository.update(id, { allowedTokens: tokens });
  }

  /**
   * Find array of collection in database
   * @param {CollectionsFilter} filter - filter params
   * @return ({Promise<ListCollectionResult>})
   */
  async findAll(filter: CollectionsFilter): Promise<ListCollectionResult> {
    if (filter.collectionId) {
      return {
        statusCode: HttpStatus.OK,
        message: '',
        data: await this.collectionsRepository.find({
          where: {
            id: filter.collectionId.toString(),
          },
        }),
      };
    } else {
      return {
        statusCode: HttpStatus.OK,
        message: '',
        data: await this.collectionsRepository.find(),
      };
    }
  }

  /**
   * Get ALL collections ids in database
   * @return ({Promise<number[]>})
   */
  async getCollectionIds(): Promise<number[]> {
    const collections = await this.collectionsRepository.find();

    return collections.map((i) => Number(i.id));
  }

  /**
   * Get Enabled collections ids in database
   * @return ({Promise<number[]>})
   */
  async getEnabledCollectionIds(): Promise<number[]> {
    const collections = await this.collectionsRepository.find({
      where: { status: CollectionStatus.Enabled },
    });

    return collections.map((i) => Number(i.id));
  }
}
