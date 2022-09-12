import { appConfig } from '@app/config';
import { ProjectNamingStrategy } from './naming_strategy';
import { DataSourceOptions } from 'typeorm/data-source/DataSourceOptions';
import * as PostgressConnectionStringParser from 'pg-connection-string';
import { DatabaseLogger } from './database.logger';
import { DataSource } from 'typeorm';

export const getConnectionOptions = (config = appConfig, test = false, logger = false) => {
  const urlDatabase = test ? config.testingPostgresUrl : config.postgresUrl;
  const connectionOptions = PostgressConnectionStringParser.parse(urlDatabase);
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
    logger: new DatabaseLogger(),
    synchronize: false,
    migrationsRun: config.autoDBMigrations || false,
    migrationsTableName: 'migrations',
    namingStrategy: new ProjectNamingStrategy(),
    subscribers: [__dirname + '/../migrations/*.{t,j}s'],
  };
  return dataSourceBasicOptions;
};

export default getConnectionOptions();
// Migrations
export const AppDataSource = new DataSource(getConnectionOptions());
