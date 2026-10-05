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
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ValidatePlotDto } from './dto/validate-plot.dto';
import { UpdateRemarksDto } from './dto/update-remarks.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { Roles } from '../../common/decorators/roles.decorator';

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

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  // Only administrator and department_head may change an entry's status.
  // This is the *only* mutation allowed on a finalized/published entry.
  @Roles('administrator', 'department_head')
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    const data = await this.service.updateStatus(id, dto.status);
    return { data };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('validate')
  async validate(@Body() dto: ValidatePlotDto) {
    const data = await this.service.validate(dto);
    return { data };
  }

  @Patch(':id/remarks')
  async updateRemarks(
    @Param('id') id: string,
    @Body() dto: UpdateRemarksDto,
  ) {
    const data = await this.service.updateRemarks(id, dto.remarks ?? null);
    return { data };
  }
}