import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubjectEditRequestsService } from './subject-edit-requests.service';
import { SubjectEditRequestStatus } from './entities/subject-edit-request.entity';
import { CreateSubjectEditRequestDto } from './dto/create-subject-edit-request.dto';
import { RespondSubjectEditRequestDto } from './dto/respond-subject-edit-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

const EDIT_REQUEST_STATUSES: readonly SubjectEditRequestStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'revoked',
];

function parseEditRequestStatus(
  value?: string,
): SubjectEditRequestStatus | undefined {
  if (value === undefined) return undefined;
  if (EDIT_REQUEST_STATUSES.includes(value as SubjectEditRequestStatus)) {
    return value as SubjectEditRequestStatus;
  }
  throw new BadRequestException('Invalid edit-request status');
}

function parseSubjectId(value: string): string;
function parseSubjectId(value: string | undefined): string | undefined;
function parseSubjectId(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const id = value.trim();
  if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid subjectId');
  return id;
}

@ApiTags('Subjects')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/subjects')
export class SubjectEditRequestsController {
  constructor(private readonly editRequests: SubjectEditRequestsService) {}

  @Roles('administrator', 'college_dean', 'college_secretary', 'department_head')
  @Get('edit-requests')
  async findVisible(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return {
      data: await this.editRequests.findVisible(
        {
          status: parseEditRequestStatus(status),
          subjectId: parseSubjectId(subjectId)
        },
        req.profile,
      ),
    };
  }

  @Roles('administrator', 'college_dean', 'college_secretary', 'department_head')
  @Get(':subjectId/edit-request')
  async findCurrentForSubject(
    @Param('subjectId') subjectId: string,
    @Req() req: any,
  ) {
    return {
      data: await this.editRequests.findCurrentForSubject(
        parseSubjectId(subjectId),
        req.profile,
      ),
    };
  }

  @Auditable({ action: 'subject_edit_request.create', source: 'Subjects' })
  @Roles('administrator', 'college_dean', 'college_secretary', 'department_head')
  @Post(':subjectId/edit-request')
  async create(
    @Param('subjectId') subjectId: string,
    @Body() dto: CreateSubjectEditRequestDto,
    @Req() req: any,
  ) {
    return {
      data: await this.editRequests.create(
        parseSubjectId(subjectId),
        dto,
        req.profile,
      ),
    };
  }

  @Auditable({ action: 'subject_edit_request.respond', source: 'Subjects' })
  @Roles('administrator', 'college_dean', 'college_secretary', 'department_head')
  @Patch('edit-requests/:requestId')
  async respond(
    @Param('requestId') requestId: string,
    @Body() dto: RespondSubjectEditRequestDto,
    @Req() req: any,
  ) {
    return {
      data: await this.editRequests.respond(requestId, dto, req.profile),
    };
  }

  @Auditable({ action: 'subject_edit_request.cancel', source: 'Subjects' })
  @Roles('administrator', 'college_dean', 'college_secretary', 'department_head')
  @Delete('edit-requests/:requestId')
  async cancel(@Param('requestId') requestId: string, @Req() req: any) {
    return { data: await this.editRequests.cancel(requestId, req.profile) };
  }
}
