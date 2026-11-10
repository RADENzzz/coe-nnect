import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Per-user navigation memory for the "Jump back" shortcuts.
 *
 * Nothing leaves the browser: a small map of `path → { count, last }` is
 * kept in localStorage under the user's id. Scores decay with a 21-day
 * half-life so last term's habits stop crowding the rail this term.
 */

const STORAGE_PREFIX = 'coe-nnect:nav-usage:v1';
const MAX_TRACKED = 16;
const HALF_LIFE_DAYS = 21;

interface VisitRecord {
  count: number;
  last: number;
}

type UsageMap = Record<string, VisitRecord>;

function storageKey(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}:${userId ?? 'anon'}`;
}

function isVisitRecord(value: unknown): value is VisitRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.count === 'number' &&
    Number.isFinite(record.count) &&
    record.count > 0 &&
    typeof record.last === 'number' &&
    Number.isFinite(record.last)
  );
}

function readUsage(key: string): UsageMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const clean: UsageMap = {};
    for (const [path, value] of Object.entries(parsed)) {
      if (path.startsWith('/') && isVisitRecord(value)) clean[path] = value;
    }
    return clean;
  } catch {
    // Storage can be unavailable (private mode) or hold corrupt JSON.
    return {};
  }
}

function writeUsage(key: string, map: UsageMap): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* Quota or private mode — shortcuts simply stop persisting. */
  }
}

/**
 * Records one visit per pathname change. Mount once per shell.
 */
export function useNavUsageRecorder(): void {
  const { pathname } = useLocation();
  const userId = useAuthStore((state) => state.profile?.user_id);
  const lastRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !pathname || pathname === '/') return;
    if (lastRecordedRef.current === pathname) return;
    lastRecordedRef.current = pathname;

    const key = storageKey(userId);
    const usage = readUsage(key);
    usage[pathname] = {
      count: (usage[pathname]?.count ?? 0) + 1,
      last: Date.now(),
    };

    // Keep the map small; most-recently-used wins the slot.
    const trimmed = Object.entries(usage)
      .sort(([, a], [, b]) => b.last - a.last)
      .slice(0, MAX_TRACKED);

    writeUsage(key, Object.fromEntries(trimmed));
  }, [pathname, userId]);
}

/**
 * The user's most-used eligible paths, best first.
 *
 * `candidates` should be the paths a shortcut may point at. A path has to be
 * used at least twice before it is suggested, unless nothing qualifies —
 * a first-week user still gets something useful rather than an empty rail.
 */
export function useNavUsageShortcuts(
  candidates: string[],
  limit = 3,
): string[] {
  const { pathname } = useLocation();
  const userId = useAuthStore((state) => state.profile?.user_id);

  // `candidates` is rebuilt by callers on every render; a stable join key
  // keeps the memo honest.
  const candidateKey = candidates.join('\u0000');

  return useMemo(() => {
    if (!userId) return [];

    const allowed = new Set(candidateKey.split('\u0000').filter(Boolean));
    if (allowed.size === 0) return [];

    const usage = readUsage(storageKey(userId));
    const now = Date.now();

    const scored = Object.entries(usage)
      .filter(([path]) => allowed.has(path) && path !== pathname)
      .map(([path, record]) => {
        const ageDays = Math.max(0, (now - record.last) / 86_400_000);
        const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
        return { path, count: record.count, score: record.count * decay };
      })
      .sort((a, b) => b.score - a.score);

    const repeated = scored.filter((entry) => entry.count >= 2);
    const pool = repeated.length >= 2 ? repeated : scored;

    return pool.slice(0, limit).map((entry) => entry.path);
  }, [candidateKey, limit, pathname, userId]);
}
