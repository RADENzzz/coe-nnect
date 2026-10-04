import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Faculty } from './entities/faculty.entity';
import { FacultyService } from './faculty.service';
import { FacultyController } from './faculty.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Faculty])],
  controllers: [FacultyController],
  providers: [FacultyService],
  exports: [FacultyService],
})
export class FacultyModule {}