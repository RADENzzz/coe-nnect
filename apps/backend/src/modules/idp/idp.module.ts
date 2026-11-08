import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { FacultyQualification } from '../faculty/entities/faculty-qualification.entity';
import { FacultyUnavailability } from '../faculty/entities/faculty-unavailability.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { User } from '../users/entities/user.entity';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IdpClientService } from './idp-client.service';
import { IdpController, IdpSyncController } from './idp.controller';
import { IdpSignatureGuard } from './idp-signature.guard';
import { IdpSyncService } from './idp-sync.service';

/**
 * IDP integration — Milestone 1.
 *
 * Inbound : signed webhooks + public health check under /api/idp/v1/*
 * Outbound: REST pulls to IDP for faculty, qualifications, unavailability
 * Trigger : POST /api/v1/idp/faculty/sync ("Refresh from IDP")
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
    ]),
  ],
  controllers: [IdpController, IdpSyncController],
  providers: [IdpClientService, IdpSyncService, IdpSignatureGuard, RolesGuard],
  exports: [IdpSyncService],
})
export class IdpModule {}
