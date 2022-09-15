import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { UniqueSdkModule } from '@app/uniquesdk/sdk.module';
import { HealthController, HealthService } from '@app/utils/health';
import { MetricsController, MetricsService } from '@app/utils/metrics';
import { PrometheusService } from '@app/utils/prometheus/prometheus.service';
import { SentryLoggerService } from '@app/utils/sentry/sentry-logger.service';
import { ConfigServiceModule } from '@app/config/module';
import { EscrowModule } from '@app/escrow/module';
import { AuctionModule } from '@app/auction/auction.module';
import { BroadcastModule } from '@app/broadcast/broadcast.module';
import { RequestLoggerMiddleware } from '@app/utils/logging/request-logger-middleware.service';
import { TradesModule } from '@app/trades/trades.module';
import { OffersModule } from '@app/offers/offers.module';
import { SettingsModule } from '@app/settings/settings.module';
import { AdminModule } from '@app/admin/admin.module';
import { DatabaseORMModule } from '@app/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'market'),
      serveRoot: '/market',
    }),
    UniqueSdkModule,
    SentryLoggerService(),
    DatabaseORMModule,
    HttpModule,
    ConfigServiceModule,
    CommandModule,
    EscrowModule,
    TerminusModule,
    AuctionModule,
    BroadcastModule,
    TradesModule,
    OffersModule,
    SettingsModule,
    AdminModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [HealthService, MetricsService, PrometheusService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
