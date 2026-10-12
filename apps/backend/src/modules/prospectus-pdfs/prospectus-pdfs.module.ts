import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { ProspectusPdf } from './entities/prospectus-pdf.entity';
import { ProspectusPdfTable } from './entities/prospectus-pdf-table.entity';
import { User } from '../users/entities/user.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';

import { ProspectusPdfsController } from './prospectus-pdfs.controller';
import { ProspectusPdfsService } from './prospectus-pdfs.service';
import { ProspectusStorageService } from './storage.service';
import { ProspectusParserClient } from './parser.client';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      ProspectusPdf,
      ProspectusPdfTable,
      User,
      Subject,
      Prospectus,
      Program,
    ]),
  ],
  controllers: [ProspectusPdfsController],
  providers: [
    ProspectusPdfsService,
    ProspectusStorageService,
    ProspectusParserClient,
  ],
  exports: [ProspectusPdfsService],
})
export class ProspectusPdfsModule {}