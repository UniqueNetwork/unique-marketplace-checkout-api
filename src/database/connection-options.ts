import { getConfig } from '../config';
import { ProjectNamingStrategy } from './naming_strategy';
import { DataSourceOptions } from 'typeorm/data-source/DataSourceOptions';
import { DataSource } from 'typeorm';

export const getConnectionOptions = (config = getConfig(), test = false, logger = false): DataSourceOptions => {
  return {
    type: 'postgres',
    url: test ? config.testingPostgresUrl : config.postgresUrl,
    entities: [__dirname + '/../**/entity.{t,j}s', __dirname + '/../entity/*.{t,j}s'],
    migrations: [__dirname + '/../migrations/*.{t,j}s'],
    synchronize: false,
    logging: logger ? logger : config.dev.debugMigrations,
    migrationsRun: true,
    //migrations: ['../../dist/migrations/**/*.js'],
    migrationsTableName: 'migrations',
    namingStrategy: new ProjectNamingStrategy(),
  };
};

export default getConnectionOptions();
export const AppDataSource = new DataSource(getConnectionOptions());
