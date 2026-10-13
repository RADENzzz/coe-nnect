import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function createApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // ─── Security headers (Helmet) ───
  //
  // We disable strict CSP initially — the SPA + Vite dev + WS + Supabase
  // all need 'unsafe-inline' / broad connectSrc, and getting CSP wrong
  // breaks the app silently. Start with everything else, then tighten
  // CSP if the panel asks.
  app.use(
    helmet({
      // CSP disabled for now — will turn on later with a tuned policy
      contentSecurityPolicy: false,

      // Cross-origin policies relaxed for SPA → API + Supabase + WS
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },

      // Everything else on (these are the headers ZAP flagged)
      // - X-Frame-Options: SAMEORIGIN      (anti-clickjacking)
      // - X-Content-Type-Options: nosniff   (MIME sniffing)
      // - Strict-Transport-Security         (HSTS, on HTTPS only)
      // - Referrer-Policy                   (referrer hardening)
      // - X-DNS-Prefetch-Control            (privacy)
      // - X-Download-Options / X-Permitted-Cross-Domain-Policies
    }),
  );

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

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

  return app;
}

// ─── Local development ───
if (process.env.VERCEL !== '1') {
  (async () => {
    const app = await createApp();
    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    logger.log(`Backend running on port ${port}`);
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