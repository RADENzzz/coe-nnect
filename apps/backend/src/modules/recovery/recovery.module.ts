import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { UserRecovery } from './entities/user-recovery.entity';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserRecovery])],
  controllers: [RecoveryController],
  providers: [RecoveryService],
})
export class RecoveryModule {}
