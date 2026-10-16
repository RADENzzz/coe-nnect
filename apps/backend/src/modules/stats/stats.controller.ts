import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StatsService } from './stats.service';
import { RepoContributorsService } from './repo-contributors.service';
import { RepoCommitsService } from './repo-commits.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/stats')
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly repoContributors: RepoContributorsService,
    private readonly repoCommits: RepoCommitsService,
  ) {}

  @Get('overview')
  async getOverview() {
    return { data: await this.stats.getOverview() };
  }

  @Get('repo-contributors')
  async getRepoContributors() {
    return { data: await this.repoContributors.getContributors() };
  }

  @Get('repo-commits')
  async getRepoCommits() {
    return { data: await this.repoCommits.getCommits() };
  }
}