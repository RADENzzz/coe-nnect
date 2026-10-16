import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Section } from '../sections/entities/section.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { User } from '../users/entities/user.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { RepoContributorsService } from './repo-contributors.service';
import { RepoCommitsService } from './repo-commits.service';

// in providers array:

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Department,
      Faculty,
      Room,
      Schedule,
      Section,
      Subject,
      Term,
      User,
    ]),
  ],
  controllers: [StatsController],
  providers: [RolesGuard, StatsService, RepoContributorsService, RepoCommitsService], 
})
export class StatsModule {}