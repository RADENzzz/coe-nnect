// apps/backend/src/modules/subjects/subjects.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectsService } from './subjects.service';
import { SubjectEditRequestsService } from './subject-edit-requests.service';
import { SubjectsController } from './subjects.controller';
import { SubjectEditRequestsController } from './subject-edit-requests.controller';
import { Subject } from './entities/subject.entity';
import { SubjectRestriction } from './entities/subject-restriction.entity';
import { SubjectEditRequest } from './entities/subject-edit-request.entity';
import { User } from '../users/entities/user.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';
import { FacultyQualification } from '../faculty/entities/faculty-qualification.entity';
import { DepartmentsModule } from '../departments/departments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SemestersModule } from '../semesters/semesters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subject,
      SubjectRestriction,
      SubjectEditRequest,
      User,        // required because the controller uses RolesGuard
      Schedule,    // required for the FK pre-flight in remove()
      Prospectus,  // required for the FK pre-flight in remove()
      FacultyQualification, // removed with the subject in remove()
    ]),
    DepartmentsModule,
    NotificationsModule,
    SemestersModule,
  ],
  controllers: [SubjectEditRequestsController, SubjectsController],
  providers: [SubjectsService, SubjectEditRequestsService],
  exports: [SubjectsService, SubjectEditRequestsService],
})
export class SubjectsModule {}