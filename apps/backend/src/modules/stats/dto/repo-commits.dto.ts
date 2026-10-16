export interface RepoCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorLogin: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorProfileUrl: string | null;
  committedAt: string; // ISO date
  url: string; // link to GitHub commit page
}

export interface RepoCommitsResponse {
  commits: RepoCommit[];
  totalFetched: number;
  latestAt: string | null;
  earliestAt: string | null;
  fetchedAt: string;
  cached: boolean;
}