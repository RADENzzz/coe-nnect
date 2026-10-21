// apps/backend/src/modules/rooms/rooms.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from './entities/room.entity';
import { RoomPreference } from './entities/room-preference.entity';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { User } from '../users/entities/user.entity';
import { DepartmentsModule } from '../departments/departments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomPreference, User]),
    DepartmentsModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}