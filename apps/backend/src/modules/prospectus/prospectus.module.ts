import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prospectus } from './entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { User } from '../users/entities/user.entity';
import { ProspectusService } from './prospectus.service';
import { ProspectusController } from './prospectus.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SemestersModule } from '../semesters/semesters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Prospectus, Program, Subject, User]),
    SemestersModule,
  ],
  controllers: [ProspectusController],
  providers: [ProspectusService, RolesGuard],
  exports: [ProspectusService],
})
export class ProspectusModule {}