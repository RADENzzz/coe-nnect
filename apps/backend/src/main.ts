import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createAppLogger } from './common/logging/structured-logger';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import {
  createGlobalRateLimiter,
  createLoginRateLimiter,
} from './config/rate-limit.config';
import {
  buildCorsOptions,
  buildHelmetOptions,
  createSwaggerAuthMiddleware,
  isSwaggerEnabled,
} from './config/security.config';

const logger = new Logger('Bootstrap');

/**
 * Register Swagger UI + OpenAPI JSON.
 *
 * Served at:
 *   - UI:   <prefix>/docs        (e.g. /api/docs)
 *   - JSON: <prefix>/docs-json   (e.g. /api/docs-json)
 *
 * `persistAuthorization: true` keeps the Bearer token across reloads
 * so the panel can authorize once and click through every endpoint.
 */
function setupSwagger(app: any, apiPrefix: string) {
  const config = new DocumentBuilder()
    .setTitle('CoE-NNECT API')
    .setDescription(
      [
        'College of Engineering Scheduling System — Western Mindanao State University.',
        '',
        '**Roles:** `college_dean`, `department_head`, `administrator` (hidden dev).',
        '',
        '**Auth:** Bearer JWT (Supabase access token).',
        'Click **Authorize** and paste a Supabase access token.',
        '',
        `**Base path:** \`/${apiPrefix}\` — all routes below assume this prefix.`,
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'Supabase access token',
      },
      'supabase-jwt',
    )
    // ── Tag registry (order matches the left sidebar) ──
    .addTag('Auth', 'Login, session, current user')
    .addTag('Users', 'User directory + role management')
    .addTag('Departments', 'Engineering departments')
    .addTag('Faculty', 'Faculty CRUD, qualifications, preferences, unavailability')
    .addTag('Subjects', 'Subjects + subject restrictions')
    .addTag('Prospectus', 'Prospectus entries + programs')
    .addTag('Prospectus PDFs', 'Upload / draw regions / extract / import')
    .addTag('Rooms', 'Rooms + room preferences')
    .addTag('Sections', 'Sections')
    .addTag('Scheduling', 'Plot, validate, auto-generate, versions, coverage')
    .addTag('Approvals', 'Cross-department faculty requests')
    .addTag('Terms', 'Academic terms')
    .addTag('System Config', 'Settings + designations')
    .addTag('Audit', 'Audit trail read')
    .addTag('Notifications', 'Inbox + settings')
    .addTag('Chat', 'Inter-office chat')
    .addTag('Constraints', 'Registered constraint rules')
    .addTag('Stats', 'System statistics + repo metadata')
    .addTag('Search', 'Global search')
    .addTag('Dev Tools', 'Developer-only tools (hidden admin)')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
      displayRequestDuration: true,
    },
    customSiteTitle: 'CoE-NNECT API Docs',
  });
}

async function createApp() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    // In dev, hide the noisiest startup categories. Set DEV_VERBOSE_LOGS=true
    // to see everything. Production and LOG_FORMAT=json use one JSON object
    // per line so a log drain can parse them without a vendor SDK.
    logger: createAppLogger(),
  });

  // Correlation id + structured request line. Mounted first so rate-limited
  // and unmatched requests are logged too.
  const requestLogger = new RequestLoggerMiddleware();
  app.use(requestLogger.use.bind(requestLogger));

  // ─── Security headers (Helmet) ───
  app.use(helmet(buildHelmetOptions()));

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  // Express needs to know how many trusted proxy hops precede the app so that
  // `req.ip` and rate limiting use the client address, not the proxy address.
  const trustProxy = process.env.TRUST_PROXY;
  if (process.env.VERCEL === '1' || trustProxy === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  } else if (trustProxy) {
    const hopCount = Number(trustProxy);
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', Number.isInteger(hopCount) ? hopCount : trustProxy);
  }

  app.enableCors(buildCorsOptions());

  // Express-level rate limiting runs for every route, including the public
  // login endpoint and Swagger. Login gets a second, stricter bucket.
  app.use(createGlobalRateLimiter());
  app.use(`/${apiPrefix}/v1/auth/login`, createLoginRateLimiter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useWebSocketAdapter(new IoAdapter(app) as any);

  // ─── Swagger (registered last, after every route module is loaded) ───
  // Development/test keep Swagger open. Production must opt in and is
  // protected with basic auth for both the UI and the OpenAPI JSON.
  if (isSwaggerEnabled()) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.SWAGGER_USER &&
      process.env.SWAGGER_PASSWORD
    ) {
      const swaggerAuth = createSwaggerAuthMiddleware();
      app.use(`/${apiPrefix}/docs`, swaggerAuth);
      app.use(`/${apiPrefix}/docs-json`, swaggerAuth);
    }
    setupSwagger(app, apiPrefix);
  }

  return app;
}

// ─── Local development ───
if (process.env.VERCEL !== '1') {
  (async () => {
    const app = await createApp();
    const port = process.env.PORT ?? 3000;
    const apiPrefix = process.env.API_PREFIX ?? 'api';
    await app.listen(port, '0.0.0.0');
    logger.log(`Backend running on port ${port} (prefix: /${apiPrefix})`);
    if (isSwaggerEnabled()) {
      logger.log(`Swagger UI    → http://localhost:${port}/${apiPrefix}/docs`);
      logger.log(`OpenAPI JSON  → http://localhost:${port}/${apiPrefix}/docs-json`);
    }
  })();
}

// ─── Vercel serverless ───
let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await createApp();
    await cachedApp.init();
  }
  const instance = cachedApp.getHttpAdapter().getInstance();
  return instance(req, res);
}