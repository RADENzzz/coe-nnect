import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SearchService } from './search.service';

@Controller('v1/search')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Roles('administrator', 'college_dean', 'department_head')
  async search(
    @Query('q') q: string,
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    const user = req.profile ?? req.user;
    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return this.searchService.search(q ?? '', user, parsedLimit);
  }
}