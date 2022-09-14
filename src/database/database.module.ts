import { Module } from '@nestjs/common';
import { ConfigServiceModule } from '@app/config/module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketConfig } from '@app/config';
import { DataSource } from 'typeorm';
import { TokenService } from './token.service';
import { CollectionService } from './collection.service';
import { getConnectionOptions } from '@app/database/connection-options';
import { BundleService } from './bundle.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigServiceModule],
      inject: ['CONFIG'],
      useFactory: async (config: MarketConfig) => {
        const optionsConnection = getConnectionOptions(config);

        return optionsConnection;
      },

      dataSourceFactory: async (options) => {
        const dataSource = await new DataSource(options).initialize();
        return dataSource;
      },
    }),
  ],
  providers: [TokenService, CollectionService, BundleService],
  exports: [TokenService, CollectionService, TypeOrmModule, BundleService],
})
export class DatabaseORMModule {}
