import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { ConstraintsModule } from './modules/constraints/constraints.module';
import { SectionsModule } from './modules/sections/sections.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { FacultyModule } from './modules/faculty/faculty.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { RoomsModule } from './modules/rooms/rooms.module';

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
    ConstraintsModule,
    SectionsModule,
    ApprovalsModule,
    FacultyModule,
    SubjectsModule,
    RoomsModule,
  ],
})
export class AppModule {}