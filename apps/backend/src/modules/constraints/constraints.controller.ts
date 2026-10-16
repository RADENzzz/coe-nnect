import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConstraintsService } from './constraints.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Constraints')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard)
@Controller('v1/constraints')
export class ConstraintsController {
  constructor(private readonly constraints: ConstraintsService) {}

  @Get('rules')
  listRules() {
    return { data: this.constraints.listRules() };
  }
}