import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from './entities/room.entity';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Room, User])],
  controllers: [RoomsController],
  providers: [RoomsService, RolesGuard],
  exports: [RoomsService],
})
export class RoomsModule {}