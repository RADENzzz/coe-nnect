import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './entities/schedule.entity';
import { TimeSlot } from './entities/time-slot.entity';
import { Term } from '../terms/entities/term.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { User } from '../users/entities/user.entity';
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
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Schedule,
      ScheduleVersion,
      TimeSlot,
      Term,
      Subject,
      Faculty,
      Room,
      User,
      Section,
    ]),
    NotificationsModule,
  ],
  controllers: [SchedulingController],
  providers: [
    SchedulingService,
    AutoGenerateService,
    RuleContextBuilder,
    ScheduleFacultyService,
    ScheduleFlagService,
    ScheduleVersionService,
    SchedulingCoverageService,
    SolverClient,
    RolesGuard,
  ],
  exports: [SchedulingService],
})
export class SchedulingModule {}