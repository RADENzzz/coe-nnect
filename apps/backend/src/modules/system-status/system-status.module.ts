import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { SystemStatus } from './entities/system-status.entity';
import { SystemStatusController } from './system-status.controller';
import { SystemStatusService } from './system-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemStatus, User])],
  controllers: [SystemStatusController],
  providers: [SystemStatusService],
  exports: [SystemStatusService],
})
export class SystemStatusModule {}