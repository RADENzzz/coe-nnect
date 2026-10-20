import { api } from './client';

export type SearchResultType =
  | 'subject'
  | 'faculty'
  | 'room'
  | 'section'
  | 'user'
  | 'term'
  | 'action';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel?: string;
  meta?: Record<string, string>;
  path: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export async function search(
  q: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<SearchResponse> {
  const { data } = await api.get<SearchResponse>('/v1/search', {
    params: { q, limit },
    signal,
  });
  return data;
}

export const searchApi = { search };
