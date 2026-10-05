import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulingSetting } from './entities/scheduling-setting.entity';
import { Designation } from './entities/designation.entity';
import { User } from '../users/entities/user.entity';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';
import { DesignationsController } from './designations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SchedulingSetting, Designation, User]),
  ],
  controllers: [SystemConfigController, DesignationsController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}