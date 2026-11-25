// apps/backend/src/modules/subjects/subjects.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';
import { Subject } from './entities/subject.entity';
import { SubjectRestriction } from './entities/subject-restriction.entity';
import { User } from '../users/entities/user.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';
import { FacultyQualification } from '../faculty/entities/faculty-qualification.entity';
import { DepartmentsModule } from '../departments/departments.module';
import { SemestersModule } from '../semesters/semesters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subject,
      SubjectRestriction,
      User,        // required because the controller uses RolesGuard
      Schedule,    // required for the FK pre-flight in remove()
      Prospectus,  // required for the FK pre-flight in remove()
      FacultyQualification, // removed with the subject in remove()
    ]),
    DepartmentsModule,
    SemestersModule,
  ],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}