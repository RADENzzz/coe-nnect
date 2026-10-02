import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import type { VercelRequest, VercelResponse } from '@vercel/node';

async function createApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  const envOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (envOrigins.includes(origin)) return callback(null, true);

      // Allow Vercel preview URLs and localhost
      const isVercel = /^https:\/\/.*\.vercel\.app$/.test(origin);
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const isLanIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin);

      if (isVercel || isLocalhost || isLanIp) {
        return callback(null, true);
      }

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

  await app.init();
  return app;
}

// ─── Local development: start a real server ───
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    const app = await createApp();
    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Backend running on port ${port}`);
    console.log(`   Allowed origins: ${(process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map(s => s.trim()).join(', ')}`);
  })();
}

// ─── Vercel serverless: export a handler ───
let cachedApp: any = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }
  const instance = cachedApp.getHttpAdapter().getInstance();
  return instance(req, res);
}