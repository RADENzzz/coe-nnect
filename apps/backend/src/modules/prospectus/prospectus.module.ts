import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prospectus } from './entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { ProspectusService } from './prospectus.service';
import { ProspectusController } from './prospectus.controller';
import { ProgramsController } from './programs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Prospectus, Program, Subject])],
  controllers: [ProspectusController, ProgramsController],
  providers: [ProspectusService],
  exports: [ProspectusService],
})
export class ProspectusModule {}