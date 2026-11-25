import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SemesterType } from './entities/semester-type.entity';
import { SemestersService } from './semesters.service';
import { SemestersController } from './semesters.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { Term } from '../terms/entities/term.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';
import { ProspectusPdfTable } from '../prospectus-pdfs/entities/prospectus-pdf-table.entity';
import { Subject } from '../subjects/entities/subject.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SemesterType,
      Term,
      Prospectus,
      ProspectusPdfTable,
      Subject,
      User,
    ]),
  ],
  controllers: [SemestersController],
  providers: [SemestersService, RolesGuard],
  exports: [SemestersService],
})
export class SemestersModule {}
