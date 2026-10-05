import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faculty } from './entities/faculty.entity';
import { FacultyQualification } from './entities/faculty-qualification.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { FacultyService } from './faculty.service';
import { FacultyController } from './faculty.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Faculty, FacultyQualification, Subject, User]),
  ],
  controllers: [FacultyController],
  providers: [FacultyService, RolesGuard],
  exports: [FacultyService],
})
export class FacultyModule {}