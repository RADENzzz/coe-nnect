import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { PlotSubjectDto } from './dto/plot-subject.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/schedules')
export class SchedulingController {
  constructor(private service: SchedulingService) {}

  @Get('active-term')
  async getActiveTerm() {
    const data = await this.service.getActiveTerm();
    return { data };
  }

  @Get()
  async findAll(@Query('termId') termId?: string) {
    const data = termId
      ? await this.service.findByTerm(termId)
      : await this.service.findAll();
    return { data };
  }

  @Post('plot')
  async plot(@Body() dto: PlotSubjectDto) {
    const data = await this.service.plot(dto);
    return { data };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: any,
  ) {
    const data = await this.service.updateStatus(id, status);
    return { data };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}