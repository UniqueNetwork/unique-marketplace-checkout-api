import { SentryModule } from './sentry.module';
import { ConfigServiceModule } from '../../config/module';
import { appConfig } from '@app/config';

/**
 *  If you wish to use Sentry please follow the instructions in the README.md
 *  Do not forget to specify SENTRY_DSN in the environment
 * @constructor
 */

export const SentryLoggerService = () => {
  if (appConfig.sentry.enabled) {
    return SentryModule.forRootAsync({
      imports: [ConfigServiceModule],
      useFactory: async () => ({
        dsn: appConfig.sentry.dsn,
        debug: appConfig.sentry.debug,
        environment: appConfig.sentry.environment, // | 'production' | 'some_environment',
        release: appConfig.sentry.release, // must create a release in sentry.io dashboard
        logLevel: 2, // 2 - debug
        sampleRate: 1,
        tracesSampleRate: 1.0,
        shutdownTimeout: 2000,
      }),
    });
  } else {
    return SentryModule.forRootAsync({
      imports: [ConfigServiceModule],
      useFactory: async () => ({}),
    });
  }
};
