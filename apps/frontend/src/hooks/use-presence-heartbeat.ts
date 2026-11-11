import { useEffect } from 'react';
import { heartbeatPresence } from '../api/users.api';

const HEARTBEAT_MS = 60_000;

/**
 * Persist a last-seen timestamp while the user is signed in.
 *
 * Supabase presence is ephemeral, so the API cannot tell the difference
 * between "closed the tab" and "network dropped". The heartbeat supplies the
 * durable half of the answer: the directory endpoint projects
 * `last_seen_at`, and the dashboard renders it when the live dot is off.
 */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let inFlight = false;

    const beat = () => {
      if (inFlight) return;
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      inFlight = true;
      void heartbeatPresence()
        .catch(() => {
          // Presence must never block the app or surface an error toast.
        })
        .finally(() => {
          inFlight = false;
        });
    };

    beat();
    const interval = window.setInterval(beat, HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') beat();
    };
    const onFocus = () => beat();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);
}
