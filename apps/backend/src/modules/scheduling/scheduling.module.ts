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
import { RuleContextBuilder } from './services/rule-context.builder';
import { SolverClient } from './services/solver.client';
import { Section } from '../sections/entities/section.entity';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Schedule,
      TimeSlot,
      Term,
      Subject,
      Faculty,
      Room,
      User,
      Section,
    ]),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, RuleContextBuilder, SolverClient, RolesGuard],
  exports: [SchedulingService],
})
export class SchedulingModule {}