import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  const envOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (envOrigins.includes(origin)) return callback(null, true);

      // Allow Vercel previews and localhost
      const isVercelPreview = /^https:\/\/.*\.vercel\.app$/.test(origin);
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const isLanIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin);

      if (isVercelPreview || isLocalhost || isLanIp) {
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on port ${port}`);
  console.log(`   Allowed origins: ${envOrigins.join(', ')}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap();