import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  RepoContributor,
  RepoContributorsResponse,
  ActivityWeek,
} from './dto/repo-contributors.dto';

interface CacheEntry {
  data: RepoContributorsResponse;
  expiresAt: number;
}

@Injectable()
export class RepoContributorsService {
  private readonly logger = new Logger(RepoContributorsService.name);
  private cache: CacheEntry | null = null;

  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly GITHUB_API = 'https://api.github.com';

  constructor() {
    const configured = !!(
      process.env.GITHUB_TOKEN &&
      process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME
    );
    if (configured) {
      this.logger.log(
        `GitHub contributors tracker enabled for ` +
          `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`,
      );
    } else {
      this.logger.warn(
        'GitHub contributors tracker disabled — set GITHUB_TOKEN, ' +
          'GITHUB_REPO_OWNER, GITHUB_REPO_NAME to enable.',
      );
    }
  }

  private get headers() {
    return {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN!}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async getContributors(): Promise<RepoContributorsResponse> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return { ...this.cache.data, cached: true };
    }

    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    if (!process.env.GITHUB_TOKEN || !owner || !repo) {
      throw new NotFoundException(
        'GitHub tracker not configured. Set GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME in backend .env.',
      );
    }

    // ── Parallel fetch: contributors list + weekly activity ──
    const [listRes, statsRes] = await Promise.all([
      fetch(
        `${this.GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=100&anon=false`,
        { headers: this.headers },
      ),
      fetch(
        `${this.GITHUB_API}/repos/${owner}/${repo}/stats/contributors`,
        { headers: this.headers },
      ),
    ]);

    if (!listRes.ok) {
      const body = await listRes.text().catch(() => '');
      this.logger.warn(
        `GitHub contributors list returned ${listRes.status}: ${body.slice(0, 200)}`,
      );
      throw new NotFoundException(
        `GitHub API error ${listRes.status}. Check token scope (needs "repo") and repo name.`,
      );
    }

    const raw = (await listRes.json()) as Array<{
      login?: string;
      name?: string | null;
      avatar_url?: string;
      contributions?: number;
      html_url?: string;
    }>;

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new NotFoundException('No contributors returned from GitHub.');
    }

    const contributors: RepoContributor[] = raw
      .filter((c) => c.login)
      .map((c) => ({
        login: c.login!,
        name: c.name ?? null,
        avatarUrl: c.avatar_url ?? '',
        contributions: c.contributions ?? 0,
        profileUrl: c.html_url ?? `https://github.com/${c.login}`,
      }))
      .sort((a, b) => b.contributions - a.contributions);

    // ── Weekly activity (aggregate across contributors) ──
    let weeklyActivity: ActivityWeek[] = [];

    if (statsRes.ok) {
      // GitHub returns 202 while it computes stats for the first time.
      // In that case, we skip the heatmap but keep the leaderboard.
      if (statsRes.status === 200) {
        const statsRaw = (await statsRes.json()) as Array<{
          weeks?: Array<{ w?: number; c?: number }>;
        }>;

        // Aggregate: sum across all contributors per week
        const weekMap = new Map<number, number>();
        for (const c of statsRaw) {
          for (const wk of c.weeks ?? []) {
            if (!wk.w) continue;
            weekMap.set(wk.w, (weekMap.get(wk.w) ?? 0) + (wk.c ?? 0));
          }
        }

        // Take the last 52 weeks and sort ascending by date
        weeklyActivity = Array.from(weekMap.entries())
          .sort((a, b) => a[0] - b[0])
          .slice(-52)
          .map(([w, c]) => ({
            weekStart: new Date(w * 1000).toISOString().slice(0, 10),
            count: c,
          }));
      } else if (statsRes.status === 202) {
        this.logger.log(
          'GitHub is computing stats — weekly activity will be available on next fetch.',
        );
      }
    } else {
      this.logger.warn(
        `GitHub stats returned ${statsRes.status} — skipping heatmap.`,
      );
    }

    const totalCommits = contributors.reduce(
      (sum, c) => sum + c.contributions,
      0,
    );

    const payload: RepoContributorsResponse = {
      topContributor: contributors[0] ?? null,
      allContributors: contributors,
      totalContributors: contributors.length,
      totalCommits,
      weeklyActivity,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    this.cache = {
      data: payload,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    };

    this.logger.log(
      `Fetched ${contributors.length} contributors (${totalCommits} commits, ` +
        `${weeklyActivity.length} weeks of activity) for ${owner}/${repo}`,
    );

    return payload;
  }
}