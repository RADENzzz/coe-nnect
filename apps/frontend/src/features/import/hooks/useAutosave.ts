import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions<T> {
  delay?: number;
  save: (payload: T) => Promise<void>;
  savedDisplayMs?: number;
  /** When true, warn the user on tab close if there are pending changes. */
  warnOnUnload?: boolean;
}

export function useAutosave<T>({
  delay = 800,
  save,
  savedDisplayMs = 1500,
  warnOnUnload = true,
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
      if (latestPayload.current !== null) void run();
    }
  }, [save, savedDisplayMs]);

  const queue = useCallback(
    (payload: T) => {
      latestPayload.current = payload;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void run(), delay);
    },
    [delay, run],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await run();
  }, [run]);

  const cancel = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    latestPayload.current = null;
  }, []);

  // Warn on tab close if there's unsaved state
  useEffect(() => {
    if (!warnOnUnload) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (state === 'saving' || latestPayload.current !== null) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [warnOnUnload, state]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
    },
    [],
  );

  return { state, error, queue, flush, cancel };
}

interface UseCommitAutosaveOptions<T> {
  /**
   * Idle time before a queued change is written. Pass `null` to disable
   * idle saving entirely — the change is then only written when `commit()`
   * is called (e.g. when the user clicks outside the edited element).
   */
  maxIdleMs?: number | null;
  save: (payload: T) => Promise<void>;
  warnOnUnload?: boolean;
}

export function useCommitAutosave<T>({
  maxIdleMs = 5000,
  save,
  warnOnUnload = true,
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
      if (pendingRef.current !== null) void runSave();
    }
  }, [save]);

  const queue = useCallback(
    (payload: T) => {
      pendingRef.current = payload;
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (typeof maxIdleMs === 'number' && maxIdleMs > 0) {
        idleTimerRef.current = window.setTimeout(
          () => void runSave(),
          maxIdleMs,
        );
      }
    },
    [maxIdleMs, runSave],
  );

  const commit = useCallback(async () => {
    await runSave();
  }, [runSave]);

  const cancel = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    pendingRef.current = null;
    setState('idle');
    setError(null);
  }, []);

  // Auto-commit on tab hide / unload
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') void runSave();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [runSave]);

  // Warn on tab close
  useEffect(() => {
    if (!warnOnUnload) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (state === 'saving' || pendingRef.current !== null) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [warnOnUnload, state]);

  return { state, error, queue, commit, cancel };
}