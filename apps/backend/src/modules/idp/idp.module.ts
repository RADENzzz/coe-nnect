import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { FacultyQualification } from '../faculty/entities/faculty-qualification.entity';
import { FacultyUnavailability } from '../faculty/entities/faculty-unavailability.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { ScheduleVersion } from '../scheduling/entities/schedule-version.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { User } from '../users/entities/user.entity';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IdpClientService } from './idp-client.service';
import { IdpController, IdpSyncController } from './idp.controller';
import { IdpSchedulePublisherService } from './idp-schedule-publisher.service';
import { IdpSignatureGuard } from './idp-signature.guard';
import { IdpSyncService } from './idp-sync.service';

/**
 * IDP integration.
 *
 * Inbound : signed webhooks + public health check under /api/idp/v1/*
 * Outbound: REST pulls to IDP for faculty, qualifications, unavailability
 *           and the Milestone 2 published-schedule push
 * Trigger : POST /api/v1/idp/faculty/sync ("Refresh from IDP")
 *           POST /api/v1/idp/schedules/publish ("Send schedule to IDP")
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Faculty,
      FacultyQualification,
      FacultyUnavailability,
      Department,
      Subject,
      Term,
      User,
      Schedule,
      ScheduleVersion,
    ]),
  ],
  controllers: [IdpController, IdpSyncController],
  providers: [
    IdpClientService,
    IdpSyncService,
    IdpSchedulePublisherService,
    IdpSignatureGuard,
    RolesGuard,
  ],
  exports: [IdpSyncService, IdpSchedulePublisherService],
})
export class IdpModule {}
