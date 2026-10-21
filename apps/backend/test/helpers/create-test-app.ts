import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ModuleMetadata } from '@nestjs/common/interfaces';
import { Test } from '@nestjs/testing';

/**
 * Builds a small Nest application for integration tests.
 *
 * Pass only the controllers/providers a test needs instead of importing
 * AppModule. That keeps tests fast and avoids opening real database or
 * Supabase connections.
 */
export async function createTestApp(
  metadata: ModuleMetadata,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule(metadata).compile();
  const app = moduleRef.createNestApplication();

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
