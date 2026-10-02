import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Don't try to load .env on Vercel — use process.env directly
      ignoreEnvFile: process.env.VERCEL === '1',
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    SchedulingModule,
  ],
})
export class AppModule {}