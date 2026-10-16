export interface RepoContributor {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributions: number;
  profileUrl: string;
}

/**
 * One week of activity for the heatmap. `weekStart` is the Sunday
 * (GitHub uses Sunday) of the week, `count` is commits in that week.
 */
export interface ActivityWeek {
  weekStart: string; // ISO date
  count: number;
}

export interface RepoContributorsResponse {
  topContributor: RepoContributor | null;
  allContributors: RepoContributor[];
  totalContributors: number;
  totalCommits: number;
  /** Aggregated weekly activity across all contributors (last 52 weeks). */
  weeklyActivity: ActivityWeek[];
  fetchedAt: string;
  cached: boolean;
}