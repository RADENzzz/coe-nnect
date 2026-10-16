import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  RepoCommit,
  RepoCommitsResponse,
} from './dto/repo-commits.dto';

interface CacheEntry {
  data: RepoCommitsResponse;
  expiresAt: number;
}

@Injectable()
export class RepoCommitsService {
  private readonly logger = new Logger(RepoCommitsService.name);
  private cache: CacheEntry | null = null;

  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly GITHUB_API = 'https://api.github.com';
  /** Hard cap so a runaway fetch doesn't hammer GitHub. */
  private readonly MAX_PAGES = 30; // 30 × 100 = 3000 commits max
  private readonly PER_PAGE = 100;

  constructor() {
    const configured = !!(
      process.env.GITHUB_TOKEN &&
      process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME
    );
    if (configured) {
      this.logger.log(
        `GitHub commit history tracker enabled for ` +
          `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`,
      );
    } else {
      this.logger.warn(
        'GitHub commit history tracker disabled — set GITHUB_TOKEN, ' +
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

  async getCommits(): Promise<RepoCommitsResponse> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return { ...this.cache.data, cached: true };
    }

    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    if (!process.env.GITHUB_TOKEN || !owner || !repo) {
      throw new NotFoundException(
        'GitHub commit history not configured. Set GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME in backend .env.',
      );
    }

    const commits: RepoCommit[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= this.MAX_PAGES) {
      const url =
        `${this.GITHUB_API}/repos/${owner}/${repo}/commits` +
        `?per_page=${this.PER_PAGE}&page=${page}`;

      let res: Response;
      try {
        res = await fetch(url, { headers: this.headers });
      } catch (err) {
        this.logger.error(`GitHub commit fetch failed: ${(err as Error).message}`);
        throw new NotFoundException('Failed to reach GitHub API.');
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `GitHub commits API returned ${res.status} (page ${page}): ${body.slice(0, 200)}`,
        );
        if (page === 1) {
          throw new NotFoundException(
            `GitHub API error ${res.status}. Check token scope (needs "repo") and repo name.`,
          );
        }
        break; // keep what we got
      }

      const raw = (await res.json()) as Array<{
        sha?: string;
        html_url?: string;
        commit?: {
          message?: string;
          author?: { name?: string; date?: string };
        };
        author?: {
          login?: string;
          avatar_url?: string;
          html_url?: string;
        } | null;
      }>;

      if (!Array.isArray(raw) || raw.length === 0) {
        hasNext = false;
        break;
      }

      for (const c of raw) {
        if (!c.sha || !c.commit) continue;
        const message = (c.commit.message ?? '').split('\n')[0]; // first line only
        const login = c.author?.login ?? null;
        commits.push({
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: message || '(no message)',
          authorLogin: login,
          authorName: c.commit.author?.name ?? login ?? 'Unknown',
          authorAvatarUrl: c.author?.avatar_url ?? null,
          authorProfileUrl: c.author?.html_url ?? (login ? `https://github.com/${login}` : null),
          committedAt: c.commit.author?.date ?? new Date().toISOString(),
          url: c.html_url ?? `https://github.com/${owner}/${repo}/commit/${c.sha}`,
        });
      }

      // Follow the next-link via the Link header
      const linkHeader = res.headers.get('link');
      hasNext = !!linkHeader && linkHeader.includes('rel="next"');
      page++;
    }

    if (commits.length === 0) {
      throw new NotFoundException('No commits returned from GitHub.');
    }

    // Commits come back newest-first (GitHub default).
    const latestAt = commits[0]?.committedAt ?? null;
    const earliestAt = commits[commits.length - 1]?.committedAt ?? null;

    const payload: RepoCommitsResponse = {
      commits,
      totalFetched: commits.length,
      latestAt,
      earliestAt,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    this.cache = {
      data: payload,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    };

    this.logger.log(
      `Fetched ${commits.length} commits for ${owner}/${repo} ` +
        `(pages: ${page - 1})`,
    );

    return payload;
  }
}