import { api } from './client';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface AuditUserRef {
  userId: string;
  username: string;
  email: string;
}

export interface AuditEntry {
  auditId: string;
  userId: string | null;
  timestamp: string;
  action: string;
  affectedData: Record<string, unknown> | null;
  sourceSystem: string | null;
  user?: AuditUserRef | null;
}

export interface AuditListResponse {
  rows: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditListFilters {
  from?: string;      // ISO date string
  to?: string;        // ISO date string
  action?: string;
  sourceSystem?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

// ────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────

export async function fetchAuditEntries(
  filters: AuditListFilters = {},
): Promise<AuditListResponse> {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.action) params.action = filters.action;
  if (filters.sourceSystem) params.sourceSystem = filters.sourceSystem;
  if (filters.userId) params.userId = filters.userId;
  if (filters.limit != null) params.limit = String(filters.limit);
  if (filters.offset != null) params.offset = String(filters.offset);

  const { data } = await api.get('/v1/audit', { params });
  return data.data;
}

export async function fetchAuditActions(): Promise<string[]> {
  const { data } = await api.get('/v1/audit/actions');
  return data.data;
}

export async function fetchAuditSources(): Promise<string[]> {
  const { data } = await api.get('/v1/audit/sources');
  return data.data;
}