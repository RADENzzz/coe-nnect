import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subject } from './entities/subject.entity';
import { SubjectRestriction } from './entities/subject-restriction.entity';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subject, SubjectRestriction, User]),
  ],
  controllers: [SubjectsController],
  providers: [SubjectsService, RolesGuard],
  exports: [SubjectsService],
})
export class SubjectsModule {}