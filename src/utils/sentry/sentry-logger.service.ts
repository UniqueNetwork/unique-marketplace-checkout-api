import { SentryModule } from './sentry.module';
import { ConfigServiceModule } from '../../config/module';
import { getConfig } from '../../config';

/**
 *  If you wish to use Sentry please follow the instructions in the README.md
 *  Do not forget to specify SENTRY_DSN in the environment
 * @constructor
 */

export const SentryLoggerService = () => {
  const config = getConfig();
  if (config.sentry.enabled) {
    return SentryModule.forRootAsync({
      imports: [ConfigServiceModule],
      useFactory: async (config = getConfig()) => ({
        dsn: config.sentry.dsn,
        debug: config.sentry.debug,
        environment: config.sentry.environment, // | 'production' | 'some_environment',
        release: config.sentry.release, // must create a release in sentry.io dashboard
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
