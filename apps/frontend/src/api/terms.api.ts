import { api } from './client';
import type { PublishedVersionSummary } from './schedule.api';

export type SemesterType = string;

export interface Term {
  termId: string;
  termName: string;
  schoolYear: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  semester: SemesterType | null;
}

export interface CreateTermInput {
  termName: string;
  schoolYear: string;
  startDate?: string | null;
  endDate?: string | null;
  semester: SemesterType;
  setActive?: boolean;
}

export async function fetchTerms(): Promise<Term[]> {
  const { data } = await api.get('/v1/terms');
  return data.data;
}

export async function fetchActiveTerm(): Promise<Term | null> {
  const { data } = await api.get('/v1/terms/active');
  return data.data;
}

export async function createTerm(input: CreateTermInput): Promise<Term> {
  const { data } = await api.post('/v1/terms', input);
  return data.data;
}

export async function activateTerm(id: string): Promise<Term> {
  const { data } = await api.patch(`/v1/terms/${id}/activate`);
  return data.data;
}

export async function deactivateTerm(id: string): Promise<Term> {
  const { data } = await api.patch(`/v1/terms/${id}/deactivate`);
  return data.data;
}

export async function deleteTerm(id: string): Promise<{ success: boolean }> {
  const { data } = await api.delete(`/v1/terms/${id}`);
  return data.data;
}

/** Read-only preflight counts shown before a term's lifecycle is changed. */
export type TermLifecycleSummary = {
  termId: string;
  termName: string;
  statusCounts: {
    draft: number;
    review: number;
    finalized: number;
    published: number;
  };
  pendingRequests: {
    publish: number;
    change: number;
    unfinalize: number;
    faculty: number;
  };
  savedVersion: PublishedVersionSummary | null;
  otherTerm: {
    termId: string;
    termName: string;
    statusCounts: {
      draft: number;
      review: number;
      finalized: number;
      published: number;
    };
  } | null;
};

export async function fetchTermLifecycleSummary(
  id: string,
  action: 'deactivate' | 'activate',
): Promise<TermLifecycleSummary> {
  const { data } = await api.get(
    action === 'deactivate'
      ? `/v1/terms/${id}/deactivation-summary`
      : `/v1/terms/${id}/activation-summary`,
  );
  return data.data;
}