import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { UserNotificationSetting } from './entities/user-notification-setting.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { RecipientsService } from './recipients.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, UserNotificationSetting, User]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationDispatcherService,
    RecipientsService,
    RolesGuard,
  ],
  exports: [
    NotificationDispatcherService,
    RecipientsService,
    NotificationsService,
  ],
})
export class NotificationsModule {}