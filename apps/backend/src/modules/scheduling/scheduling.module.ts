// apps/backend/src/modules/scheduling/scheduling.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './entities/schedule.entity';
import { TimeSlot } from './entities/time-slot.entity';
import { Term } from '../terms/entities/term.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { User } from '../users/entities/user.entity';
import { SchedulePublishService } from './services/schedule-publish.service';
import { SchedulePublishController } from './schedule-publish.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';
import { AutoGenerateService } from './services/auto-generate.service';
import { RuleContextBuilder } from './services/rule-context.builder';
import { ScheduleFacultyService } from './services/schedule-faculty.service';
import { ScheduleFlagService } from './services/schedule-flag.service';
import { ScheduleVersionService } from './services/schedule-version.service';
import { SchedulingCoverageService } from './services/scheduling-coverage.service';
import { SolverClient } from './services/solver.client';
import { Section } from '../sections/entities/section.entity';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ScheduleVersion } from './entities/schedule-version.entity';
import { ScheduleUnfinalizeRequest } from './entities/schedule-unfinalize-request.entity';
import { SchedulePublishRequest } from './entities/schedule-publish-request.entity';
import { ScheduleChangeRequest } from './entities/schedule-change-request.entity';
import { TermPublishedVersion } from './entities/term-published-version.entity';
import { TermPublishedVersionService } from './services/term-published-version.service';
import { TermLifecycleService } from './services/term-lifecycle.service';
import { ScheduleUnfinalizeService } from './services/schedule-unfinalize.service';
import { ScheduleChangeRequestService } from './services/schedule-change-request.service';
import { ScheduleUnfinalizeController } from './schedule-unfinalize.controller';
import { ScheduleChangeRequestController } from './schedule-change-request.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { DepartmentsModule } from '../departments/departments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Schedule,
      ScheduleVersion,
      ScheduleUnfinalizeRequest,
      SchedulePublishRequest,
      ScheduleChangeRequest,
      TermPublishedVersion,
      TimeSlot,
      Term,
      Subject,
      Faculty,
      Room,
      User,
      Section,
    ]),
    NotificationsModule,
    DepartmentsModule,
  ],
  // The request controllers go first: their literal routes must resolve
  // before the scheduling controller's `:id` routes.
  controllers: [
    ScheduleUnfinalizeController,
    SchedulePublishController,
    ScheduleChangeRequestController,
    SchedulingController,
  ],
  providers: [
    SchedulingService,
    ScheduleUnfinalizeService,
    SchedulePublishService,
    ScheduleChangeRequestService,
    AutoGenerateService,
    RuleContextBuilder,
    ScheduleFacultyService,
    ScheduleFlagService,
    ScheduleVersionService,
    SchedulingCoverageService,
    TermPublishedVersionService,
    TermLifecycleService,
    SolverClient,
    RolesGuard,
  ],
  exports: [
    SchedulingService,
    ScheduleUnfinalizeService,
    SchedulePublishService,
    ScheduleChangeRequestService,
    TermPublishedVersionService,
    TermLifecycleService,
  ],
})
export class SchedulingModule {}