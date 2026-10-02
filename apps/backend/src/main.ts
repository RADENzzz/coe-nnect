import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  // Parse allowed origins from env (comma-separated)
  const envOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      // Allow if origin is in the whitelist
      if (envOrigins.includes(origin)) return callback(null, true);

      // In development, allow any LAN IP or localhost
      if (process.env.NODE_ENV !== 'production') {
        const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
        const isLanIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin);
        if (isLocalhost || isLanIp) return callback(null, true);
      }

      // Otherwise reject
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');   // ← Listen on all interfaces, not just localhost

  console.log(`🚀 Backend running on port ${port}`);
  console.log(`   Allowed origins (env): ${envOrigins.join(', ')}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap();