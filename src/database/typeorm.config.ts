import { DataSource } from 'typeorm';
import { ProjectNamingStrategy } from '@app/database/naming_strategy';
import { getConfig } from '@app/config';

const config = getConfig();

export default new DataSource({
  type: 'postgres',
  host: config.base.host,
  port: config.base.port,
  username: config.base.username,
  password: config.base.password,
  database: config.base.database,
  entities: [__dirname + '/../**/entity.{t,j}s', __dirname + '/../entity/*.{t,j}s'],
  migrations: [__dirname + '/../migrations/*.{t,j}s'],
  logging: false,
  migrationsRun: true,
  migrationsTableName: 'migrations',
  namingStrategy: new ProjectNamingStrategy(),
});
