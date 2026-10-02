import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './entities/schedule.entity';
import { TimeSlot } from './entities/time-slot.entity';
import { Term } from '../terms/entities/term.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { User } from '../users/entities/user.entity';   // ← ADD THIS
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Schedule,
      TimeSlot,
      Term,
      Subject,
      Faculty,
      Room,
      User,   // ← ADD THIS
    ]),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}