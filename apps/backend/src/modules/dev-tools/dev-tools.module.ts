import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { UserPresence } from '../users/entities/user-presence.entity';
import { DevToolsService } from './dev-tools.service';
import { DevToolsController } from './dev-tools.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserPresence])],
  controllers: [DevToolsController],
  providers: [DevToolsService],
  exports: [DevToolsService],
})
export class DevToolsModule {}