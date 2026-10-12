import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions<T> {
  /** Debounce delay in ms. Default 800. */
  delay?: number;
  /** Async saver. Must throw on failure. */
  save: (payload: T) => Promise<void>;
  /** Show "Saved" indicator for this many ms before fading. Default 1500. */
  savedDisplayMs?: number;
}

/**
 * Debounced autosave with optimistic UI. Returns a `queue` function
 * that schedules a save with the latest payload, plus a state machine.
 *
 * Rapid calls within the debounce window collapse to a single save with
 * the most recent payload.
 */
export function useAutosave<T>({
  delay = 800,
  save,
  savedDisplayMs = 1500,
}: UseAutosaveOptions<T>) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const fadeRef = useRef<number | null>(null);
  const latestPayload = useRef<T | null>(null);
  const savingRef = useRef(false);

  const run = useCallback(async () => {
    if (latestPayload.current === null) return;
    if (savingRef.current) return;

    const payload = latestPayload.current;
    latestPayload.current = null;
    savingRef.current = true;
    setState('saving');
    setError(null);

    try {
      await save(payload);
      setState('saved');

      if (fadeRef.current) window.clearTimeout(fadeRef.current);
      fadeRef.current = window.setTimeout(() => {
        setState((s) => (s === 'saved' ? 'idle' : s));
      }, savedDisplayMs);
    } catch (err: unknown) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      savingRef.current = false;
      // If another payload was queued while we were saving, run again.
      if (latestPayload.current !== null) {
        void run();
      }
    }
  }, [save, savedDisplayMs]);

  const queue = useCallback(
    (payload: T) => {
      latestPayload.current = payload;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void run();
      }, delay);
    },
    [delay, run],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await run();
  }, [run]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
    };
  }, []);

  return { state, error, queue, flush };
}

interface UseCommitAutosaveOptions<T> {
  /** Debounce delay after last change, as a safety net. Default 5000. */
  maxIdleMs?: number;
  /** Async saver. Must throw on failure. */
  save: (payload: T) => Promise<void>;
}

/**
 * Autosave that fires ONLY when the user explicitly commits
 * (calls `commit()`) or after a long idle safety timeout.
 *
 * Use this for editing flows where rapid mid-drag saves are
 * undesirable — e.g. table/row editors.
 */
export function useCommitAutosave<T>({
  maxIdleMs = 5000,
  save,
}: UseCommitAutosaveOptions<T>) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const idleTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<T | null>(null);
  const inFlightRef = useRef(false);

  const runSave = useCallback(async () => {
    if (pendingRef.current === null) return;
    if (inFlightRef.current) return;

    const payload = pendingRef.current;
    pendingRef.current = null;
    inFlightRef.current = true;

    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    setState('saving');
    setError(null);

    try {
      await save(payload);
      setState('saved');
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        setState((s) => (s === 'saved' ? 'idle' : s));
      }, 1500);
    } catch (err: unknown) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current !== null) {
        void runSave();
      }
    }
  }, [save]);

  /**
   * Stage a payload. It will be saved when:
   *   - `commit()` is called, OR
   *   - maxIdleMs elapses with no further `queue()` or `commit()` calls
   */
  const queue = useCallback(
    (payload: T) => {
      pendingRef.current = payload;
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        void runSave();
      }, maxIdleMs);
    },
    [maxIdleMs, runSave],
  );

  /** Save immediately. Use on deselect, page close, etc. */
  const commit = useCallback(async () => {
    await runSave();
  }, [runSave]);

  /** Current state. */
  return { state, error, queue, commit };
}