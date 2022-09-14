import { Module } from '@nestjs/common';
import { ConfigServiceModule } from '@app/config/module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketConfig } from '@app/config/market-config';
import { DataSourceOptions } from 'typeorm/data-source/DataSourceOptions';
import { ProjectNamingStrategy } from '@app/database/naming_strategy';
import { Logger } from 'typeorm/logger/Logger';
import { QueryRunner } from 'typeorm';
import * as PostgressConnectionStringParser from 'pg-connection-string';

export class DBCustomLogger implements Logger {
  private _queryRunner: QueryRunner;
  log(level: 'log' | 'info' | 'warn', message: any, queryRunner?: QueryRunner): any {
    this._queryRunner = queryRunner;
  }

  logMigration(message: string, queryRunner?: QueryRunner): any {
    this._queryRunner = queryRunner;
  }

  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner): any {
    this._queryRunner = queryRunner;
  }

  logQueryError(error: string | Error, query: string, parameters?: any[], queryRunner?: QueryRunner): any {
    this._queryRunner = queryRunner;
  }

  logQuerySlow(time: number, query: string, parameters?: any[], queryRunner?: QueryRunner): any {
    this._queryRunner = queryRunner;
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner): any {
    this._queryRunner = queryRunner;
  }
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigServiceModule],
      inject: ['CONFIG'],
      useFactory: async (config: MarketConfig) => {
        const connectionOptions = PostgressConnectionStringParser.parse(config.postgresUrl);
        const dataSourceBasicOptions: DataSourceOptions = {
          type: 'postgres',
          host: connectionOptions.host,
          port: +connectionOptions.port,
          username: connectionOptions.user,
          password: connectionOptions.password,
          database: connectionOptions.database,
          entities: [__dirname + '/../**/entity.{t,j}s', __dirname + '/../entity/*.{t,j}s'],
          migrations: [__dirname + '/../migrations/*.{t,j}s'],
          logging: ['error'],
          logger: new DBCustomLogger(),
          synchronize: false,
          migrationsRun: config.autoDBMigrations || false,
          migrationsTableName: 'migrations',
          namingStrategy: new ProjectNamingStrategy(),
        };

        // await runSeeders(new DataSource(options), {
        //   seeds: [UniqueNetworkSeeder],
        //   factories: [UniqueNetworkFactory],
        // });
        return dataSourceBasicOptions;
      },
    }),
  ],
})
export class DatabaseORMModule {}
