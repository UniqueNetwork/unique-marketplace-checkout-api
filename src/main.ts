import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { expressMiddleware as prometheusMiddleware } from 'prometheus-api-metrics';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { yellow, green } from 'cli-color';
import { AppModule } from '@app/app.module';
import { ignoreQueryCase, useGlobalPipes } from '@app/utils/application';
import * as fs from 'fs';
import { promises } from 'fs';
import { join } from 'path';
import { PostgresIoAdapter } from '@app/broadcast/services/postgres-io.adapter';
import helmet from 'helmet';

const APP_NAME_PREFIX = 'unique-marketplace-api';
const logger = new Logger('NestApplication', { timestamp: true });
const getAppsLink = (wsUrl: string): string => `(<a target="_blank" href="https://polkadot.js.org/apps/?rpc=${wsUrl}">apps ↗</a>)`;

const addDocuments = async (app: INestApplication) => {
  const config = app.get('CONFIG');
  const pkg = JSON.parse(await promises.readFile(join('.', 'package.json'), 'utf8'));
  const fileDocument = fs.readFileSync('docs/description.md').toString();
  const mainDescription = `Main connection to **${config.blockchain.unique.wsEndpoint}** ${getAppsLink(
    config.blockchain.unique.wsEndpoint,
  )}`;
  const secondaryDescription = `Secondary connection to **${config.blockchain.kusama.wsEndpoint}** ${getAppsLink(
    config.blockchain.kusama.wsEndpoint,
  )}`;
  const statusMarket = `Market type: _**${config.marketType.toUpperCase()}**_`;
  const fileDocumentSecondary = fs.readFileSync('docs/description_secondary.md').toString();
  return [statusMarket, fileDocument, mainDescription, secondaryDescription, fileDocumentSecondary].filter((el) => el).join('\n\n');
};

const initSwagger = async (app: INestApplication, config, pkg) => {
  const swaggerConf = new DocumentBuilder()
    .setTitle(config.swagger.title)
    .setDescription(await addDocuments(app))
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
      },
      'address:signature',
    )
    .setVersion(pkg.version)
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConf);

  SwaggerModule.setup('api/docs', app, swaggerDocument);
};

let app: INestApplication;

/**
 * Start the application.
 * @description This is the main entry point for the application.
 */
async function bootstrap() {
  process.env.NODE_ENV === 'production'
    ? (app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] }))
    : (app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn', 'debug'] }));
  const config = app.get('CONFIG');
  const pkg = JSON.parse(await promises.readFile(join('.', 'package.json'), 'utf8'));

  if (config.disableSecurity) {
    // app.use((req, res, next) => {
    //   res.header('Access-Control-Allow-Origin', '*');
    //   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS,HEAD');
    //   res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Signature, Authorization');
    //   next();
    // });

    app.enableCors({
      allowedHeaders: 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Observe, Signature, Authorization',
      origin: true,
      credentials: true,
    });
    app.use(helmet());
  }

  app.use(
    prometheusMiddleware({
      additionalLabels: ['app'],
      extractAdditionalLabelValuesFn: () => ({ app: APP_NAME_PREFIX }),
    }),
  );

  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new PostgresIoAdapter(app));

  await initSwagger(app, config, pkg);
  ignoreQueryCase(app);
  useGlobalPipes(app);

  const port = parseInt(process.env.API_PORT) || config.listenPort;
  await app.listen(port, () => {
    logger.log(`Nest application listening on port: ${yellow(port)}`);
    logger.log(`Nest application ${green('version:')} ${yellow(pkg.version)} ${green('started!')}`);
  });
}

/**
 * Shutdown the application.
 */
bootstrap().catch((error: unknown) => {
  logger.error('Bootstrapping application failed! ' + error);
});

/**
 * GracefulShutdown
 */
async function gracefulShutdown(): Promise<void> {
  if (app !== undefined) {
    await app.close();
    logger.warn('Application closed!');
  }
  process.exit(0);
}

/**
 * Handle the SIGINT signal.
 */
process.once('SIGTERM', async () => {
  logger.warn('SIGTERM: Graceful shutdown... ');
  await gracefulShutdown();
});

/**
 * Handle the SIGINT signal.
 */
process.once('SIGINT', async () => {
  logger.warn('SIGINT: Graceful shutdown... ');
  await gracefulShutdown();
});
