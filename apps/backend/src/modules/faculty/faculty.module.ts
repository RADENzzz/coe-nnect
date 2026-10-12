import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faculty } from './entities/faculty.entity';
import { FacultyPreference } from './entities/faculty-preference.entity';
import { FacultyUnavailability } from './entities/faculty-unavailability.entity';
import { FacultyQualification } from './entities/faculty-qualification.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { User } from '../users/entities/user.entity';
import { FacultyService } from './faculty.service';
import { FacultyController } from './faculty.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Faculty,
      FacultyPreference,
      FacultyUnavailability,   // ← new
      FacultyQualification,
      Subject,                 // ← needed by FacultyService
      User,
    ]),
    NotificationsModule,       // ← if your service uses the dispatcher
  ],
  controllers: [FacultyController],
  providers: [FacultyService, RolesGuard],
  exports: [FacultyService],
})
export class FacultyModule {}