import { useEffect, useState } from 'react';

/**
 * A shared clock for relative timestamps ("5 mins ago", "2 hrs ago").
 *
 * Components re-render on the interval so labels age even when no data is
 * refetched. Thirty seconds is fine-grained enough for minute labels without
 * causing visible churn.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
