import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Designation } from '../system-config/entities/designation.entity';
import { Term } from '../terms/entities/term.entity';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/**
 * Read-only public landing page module.
 *
 * Deliberately has no JwtAuthGuard/RolesGuard: it backs the pages a visitor
 * sees before signing in.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Schedule,
      Faculty,
      Department,
      Subject,
      Room,
      Term,
      Designation,
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
