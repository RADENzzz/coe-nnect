import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

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
  // to see everything (or NODE_ENV=production to see default Nest verbosity).
  logger:
    process.env.NODE_ENV === 'development' && process.env.DEV_VERBOSE_LOGS !== 'true'
      ? ['error', 'warn', 'log', 'fatal']
      : ['error', 'warn', 'log', 'debug', 'verbose', 'fatal'],
});

  // ─── Security headers (Helmet) ───
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  const envOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (envOrigins.includes(origin)) return callback(null, true);
      const isVercel = /^https:\/\/.*\.vercel\.app$/.test(origin);
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const isLanIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin);
      if (isVercel || isLocalhost || isLanIp) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useWebSocketAdapter(new IoAdapter(app) as any);

  // ─── Swagger (registered last, after every route module is loaded) ───
  setupSwagger(app, apiPrefix);

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
    logger.log(`Swagger UI    → http://localhost:${port}/${apiPrefix}/docs`);
    logger.log(`OpenAPI JSON  → http://localhost:${port}/${apiPrefix}/docs-json`);
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