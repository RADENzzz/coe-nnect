import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth.store';

export type OnlineRole =
  | 'administrator'
  | 'college_dean'
  | 'department_head'
  | 'viewer';

export interface OnlineUser {
  user_id: string;
  username: string;
  role: OnlineRole;
  dept_id: number | null;
  dept_code: string | null;
  dept_name: string | null;
  online_at: string;
}

interface UseOnlineUsersResult {
  onlineUsers: OnlineUser[];
  isConnected: boolean;
  count: number;
}

/**
 * Subscribe to the "presence:online-users" Supabase Realtime channel.
 *
 * Each connected client tracks its own payload. Every subscriber sees the
 * merged list. Presence is per-tab; this hook dedupes by user_id.
 *
 * Caveats:
 *   - Tab close / network drop is inferred after ~60s heartbeat timeout
 *   - Multiple tabs for the same user collapse into one entry
 */
export function useOnlineUsers(): UseOnlineUsersResult {
  const profile = useAuthStore((s) => s.profile);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Keep the channel in a ref so we can unsubscribe cleanly
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!profile) {
      setOnlineUsers([]);
      setIsConnected(false);
      return;
    }

    const channel = supabase.channel('presence:online-users', {
      config: {
        presence: { key: profile.user_id },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();

        // state is { [key: string]: PresencePayload[] }
        const flat = Object.values(state).flat() as Array<
          Record<string, unknown>
        >;

        // Dedupe by user_id (multi-tab collapse)
        const byUserId = new Map<string, OnlineUser>();
        for (const raw of flat) {
          const userId = String(
            (raw as any).user_id ?? (raw as any).userId ?? '',
          );
          if (!userId) continue;
          if (byUserId.has(userId)) continue;

          const rawDeptId =
            (raw as any).dept_id ?? (raw as any).deptId ?? null;

          byUserId.set(userId, {
            user_id: userId,
            username: String((raw as any).username ?? ''),
            role: ((raw as any).role ?? 'viewer') as OnlineRole,
            dept_id:
              rawDeptId != null && rawDeptId !== ''
                ? Number(rawDeptId)
                : null,
            dept_code:
              (raw as any).dept_code ?? (raw as any).deptCode ?? null,
            dept_name:
              (raw as any).dept_name ?? (raw as any).deptName ?? null,
            online_at: String(
              (raw as any).online_at ??
                (raw as any).onlineAt ??
                new Date().toISOString(),
            ),
          });
        }

        // Sort: self first, then role priority, then username
        const roleOrder: Record<OnlineRole, number> = {
          administrator: 0,
          college_dean: 1,
          department_head: 2,
          viewer: 3,
        };

        const sorted = Array.from(byUserId.values()).sort((a, b) => {
          if (a.user_id === profile.user_id) return -1;
          if (b.user_id === profile.user_id) return 1;
          const roleDiff = roleOrder[a.role] - roleOrder[b.role];
          if (roleDiff !== 0) return roleDiff;
          return a.username.localeCompare(b.username);
        });

        setOnlineUsers(sorted);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          await channel.track({
            user_id: profile.user_id,
            username: profile.username,
            role: profile.role,
            dept_id: profile.dept_id,
            dept_code: profile.dept_code,
            dept_name: profile.dept_name,
            online_at: new Date().toISOString(),
          });
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setIsConnected(false);
        }
      });

    return () => {
      setIsConnected(false);
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id]);

  return {
    onlineUsers,
    isConnected,
    count: onlineUsers.length,
  };
}