import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Section } from './entities/section.entity';
import { Program } from '../programs/entities/program.entity';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Section, Program, User])],
  controllers: [SectionsController],
  providers: [SectionsService, RolesGuard],
  exports: [SectionsService],
})
export class SectionsModule {}