import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');

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

  // ═══ WebSocket adapter — enables @WebSocketGateway() for Notifications ═══
  // The IoAdapter uses the CORS settings baked into each gateway's
  // @WebSocketGateway({ cors: {...} }) decorator, not the HTTP CORS above.
  // We'll set gateway CORS in Batch 2.
  app.useWebSocketAdapter(new IoAdapter(app));

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
    await cachedApp.init();   // ← CRITICAL: registers routes
  }
  const instance = cachedApp.getHttpAdapter().getInstance();
  return instance(req, res);
}