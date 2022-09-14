import { Tokens } from '@app/entity';
import { AddTokenType } from '@app/types';
import { Injectable, Logger } from '@nestjs/common';
import { yellow, red } from 'cli-color';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TokenService {
  private readonly tokensRepository: Repository<Tokens>;
  private readonly logger: Logger;

  constructor(private connection: DataSource) {
    this.tokensRepository = this.connection.getRepository(Tokens);
    this.logger = new Logger(TokenService.name, { timestamp: true });
  }
  /**
   * Find token by id and collection id
   * @param {number} tokenId token id
   * @param  {number} collectionId collection id
   * @returns {Promise<Tokens>}
   */
  async byId(tokenId: number, collectionId: number): Promise<Tokens> {
    return await this.tokensRepository.findOne({
      where: {
        collection_id: collectionId.toString(),
        token_id: tokenId.toString(),
      },
    });
  }
  /**
   *  Save token to database
   *  If token not found in database - create new token and save to database
   *  If token found in database - update token data
   * @param {AddTokenType} token token
   */
  async save(token: AddTokenType): Promise<boolean> {
    try {
      const decoderToken = {
        collection_id: String(token.collectionId),
        token_id: String(token.tokenId),
        owner_token: String(token.owner),
        data: token.data as any,
        nested: token.nested,
      };

      const _token = await this.tokensRepository.create(decoderToken);
      const existing = await this.byId(token.tokenId, token.collectionId);

      if (existing) {
        try {
          await this.tokensRepository.save({ id: existing.id, ..._token });
          return true;
        } catch (error) {
          console.error(error);
          this.logger.error(`Token #${yellow(token.tokenId)} ${red('updating data error')}`);
          new Error(`Error while updating token`);
          return false;
        }
      } else {
        try {
          await this.tokensRepository.save(_token);
          return true;
        } catch (error) {
          console.error(error);
          this.logger.error(`Token #${yellow(token.tokenId)} ${red('saving data error')}`);
          new Error(`Error while saving token`);
          return false;
        }
      }
    } catch (error) {
      this.logger.error(`Error saving token ${token.tokenId} in collection ${token.collectionId}`, error);
      new Error(error.message);
      return false;
    }
  }

  async deleteByCollectionId(collectionId: string) {
    await this.tokensRepository
      .createQueryBuilder()
      .delete()
      .from(Tokens)
      .where('collection_id = :collection_id', { collection_id: collectionId })
      .execute();
  }
}
