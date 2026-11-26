import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Term } from './entities/term.entity';
import { TermsService } from './terms.service';
import { TermsController } from './terms.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SemestersModule } from '../semesters/semesters.module';
import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Term, User]),
    NotificationsModule,
    SemestersModule,
    SchedulingModule,
  ],
  controllers: [TermsController],
  providers: [TermsService, RolesGuard],
  exports: [TermsService],
})
export class TermsModule {}