import { Global, Module } from '@nestjs/common';
import { ConstraintsService } from './constraints.service';
import { ConstraintsController } from './constraints.controller';

@Global()
@Module({
  controllers: [ConstraintsController],
  providers: [ConstraintsService],
  exports: [ConstraintsService],
})
export class ConstraintsModule {}