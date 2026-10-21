import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';

export function createDataSourceOptions(config: ConfigService): DataSourceOptions {
  const sslEnabled =
    config.get<string>('DATABASE_SSL')?.trim().toLowerCase() !== 'false';

  return {
    type: 'postgres',
    url: config.get<string>('DATABASE_URL'),
    entities: [__dirname + '/../modules/**/entities/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false, // NEVER true — schema is managed by Supabase SQL
    logging: config.get('NODE_ENV') === 'development',
    // Hosted Supabase requires TLS. Local Supabase/CI sets DATABASE_SSL=false.
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}

// Standalone DataSource for TypeORM CLI (migrations, seeds)
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/modules/**/entities/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  ssl:
    process.env.DATABASE_SSL?.trim().toLowerCase() === 'false'
      ? false
      : { rejectUnauthorized: false },
});
