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
import { IdpDeviceGuard } from './idp-device.guard';
import { IdpOutboxService } from './idp-outbox.service';
import { IdpSchedulePublisherService } from './idp-schedule-publisher.service';
import { IdpSignatureGuard } from './idp-signature.guard';
import { IdpSyncService } from './idp-sync.service';
import { IdpOutboxItem } from './entities/idp-outbox.entity';
import { IdpProcessedEvent } from './entities/idp-processed-event.entity';

/**
 * IDP integration.
 *
 * Pattern C (primary): the offline-capable IDP desktop app pushes faculty
 * snapshots to `/api/idp/v1/inbox/faculty` and polls
 * `/api/idp/v1/outbox/schedules` for published schedules, authenticated with
 * `IDP_DEVICE_API_KEY`.
 *
 * Pattern A (fallback): outbound REST pulls to IDP for faculty,
 * qualifications, unavailability, and the published-schedule push, plus
 * signed inbound webhooks.
 *
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
      IdpProcessedEvent,
      IdpOutboxItem,
    ]),
  ],
  controllers: [IdpController, IdpSyncController],
  providers: [
    IdpClientService,
    IdpSyncService,
    IdpOutboxService,
    IdpSchedulePublisherService,
    IdpDeviceGuard,
    IdpSignatureGuard,
    RolesGuard,
  ],
  exports: [IdpSyncService, IdpOutboxService, IdpSchedulePublisherService],
})
export class IdpModule {}
