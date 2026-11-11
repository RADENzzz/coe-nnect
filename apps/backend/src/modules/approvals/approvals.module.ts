import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacultyRequest } from './entities/faculty-request.entity';
import { User } from '../users/entities/user.entity';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdpModule } from '../idp/idp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacultyRequest, User]),
    NotificationsModule,
    IdpModule,
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}