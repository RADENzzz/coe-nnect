import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Program } from './entities/program.entity';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { User } from '../users/entities/user.entity';
import { DepartmentsModule } from '../departments/departments.module';

@Module({
  imports: [
    // User is required because the controller uses RolesGuard.
    TypeOrmModule.forFeature([Program, User]),
    DepartmentsModule,
  ],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
