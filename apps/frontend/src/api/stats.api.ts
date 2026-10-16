import { api } from './client';

// ────────────────────────────────────────────
// System overview stats
// ────────────────────────────────────────────

export interface StatsOverview {
  activeDepartments: number;
  activeFaculty: number;
  activeSubjects: number;
  activeRooms: number;
  activeSections: number;
  scheduleEntries: number;
  academicTerms: number;
  activeAccounts: number;
}

export async function fetchStatsOverview(): Promise<StatsOverview> {
  const { data } = await api.get('/v1/stats/overview');
  return data.data;
}

// ────────────────────────────────────────────
// GitHub contributors (Help page easter egg)
// ────────────────────────────────────────────

export interface RepoContributor {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributions: number;
  profileUrl: string;
}

/**
 * One week of aggregated commit activity. `weekStart` is the Sunday
 * (GitHub convention) of the week, in ISO date form (YYYY-MM-DD).
 */
export interface ActivityWeek {
  weekStart: string;
  count: number;
}

export interface RepoContributorsResponse {
  topContributor: RepoContributor | null;
  allContributors: RepoContributor[];
  totalContributors: number;
  totalCommits: number;
  /** Last 52 weeks of project-wide commit activity. Empty if GitHub
   *  returned 202 (stats still computing) on the initial fetch. */
  weeklyActivity: ActivityWeek[];
  fetchedAt: string;
  cached: boolean;
}

export async function fetchRepoContributors(): Promise<RepoContributorsResponse> {
  const { data } = await api.get('/v1/stats/repo-contributors');
  return data.data;
}

export interface RepoCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorLogin: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorProfileUrl: string | null;
  committedAt: string;
  url: string;
}

export interface RepoCommitsResponse {
  commits: RepoCommit[];
  totalFetched: number;
  latestAt: string | null;
  earliestAt: string | null;
  fetchedAt: string;
  cached: boolean;
}

export async function fetchRepoCommits(): Promise<RepoCommitsResponse> {
  const { data } = await api.get('/v1/stats/repo-commits');
  return data.data;
}