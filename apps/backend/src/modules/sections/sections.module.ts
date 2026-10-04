import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Section } from './entities/section.entity';
import { User } from '../users/entities/user.entity';   // ← NEW
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Section, User]),   // ← add User
  ],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService],
})
export class SectionsModule {}