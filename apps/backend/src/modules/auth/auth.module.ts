import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { Department } from '../departments/entities/department.entity';
import { SystemStatusModule } from '../system-status/system-status.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Department]), SystemStatusModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}