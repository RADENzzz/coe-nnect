import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import { usePresenceHeartbeat } from '../../hooks/use-presence-heartbeat';

/**
 * Session-scoped presence keeper.
 *
 * `useOnlineUsers` owns one Supabase channel and tears it down when the last
 * React consumer unmounts. Before this component existed, only the dashboard
 * pages (and chat) consumed the hook, so navigating anywhere else untracked
 * the user — everyone else saw them go offline until they returned.
 *
 * Mounted once above the router: it stays subscribed for the whole signed-in
 * session, keeps this browser tracked, and drives the last-seen heartbeat.
 */
export default function PresenceProvider() {
  const profile = useAuthStore((s) => s.profile);
  useOnlineUsers();
  usePresenceHeartbeat(!!profile);

  return null;
}
