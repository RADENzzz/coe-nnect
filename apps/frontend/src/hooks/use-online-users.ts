import { useEffect, useState } from 'react';
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

// ═══════════════════════════════════════════════════════════
// Singleton presence channel
//
// Supabase channels are named globally. Two components calling
// `supabase.channel('presence:online-users')` will collide —
// the second one errors with "cannot add presence callbacks
// after subscribe()".
//
// This module owns ONE channel. Components subscribe to its
// state via listener callbacks. When the last subscriber
// unmounts, the channel is torn down.
// ═══════════════════════════════════════════════════════════

type Listener = (state: {
  onlineUsers: OnlineUser[];
  isConnected: boolean;
}) => void;

interface PresenceStoreState {
  channel: ReturnType<typeof supabase.channel> | null;
  listeners: Set<Listener>;
  currentUserId: string | null;
  lastState: { onlineUsers: OnlineUser[]; isConnected: boolean };
}

const store: PresenceStoreState = {
  channel: null,
  listeners: new Set(),
  currentUserId: null,
  lastState: { onlineUsers: [], isConnected: false },
};

const CHANNEL_NAME = 'presence:online-users';

function emit() {
  for (const listener of store.listeners) {
    listener(store.lastState);
  }
}

function sortAndDedupe(
  flat: Array<Record<string, unknown>>,
  selfUserId: string | null,
): OnlineUser[] {
  const roleOrder: Record<OnlineRole, number> = {
    administrator: 0,
    college_dean: 1,
    department_head: 2,
    viewer: 3,
  };

  const byUserId = new Map<string, OnlineUser>();
  for (const raw of flat) {
    const userId = String(
      (raw as any).user_id ?? (raw as any).userId ?? '',
    );
    if (!userId) continue;
    if (byUserId.has(userId)) continue;

    const rawDeptId = (raw as any).dept_id ?? (raw as any).deptId ?? null;

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

  return Array.from(byUserId.values()).sort((a, b) => {
    if (selfUserId) {
      if (a.user_id === selfUserId) return -1;
      if (b.user_id === selfUserId) return 1;
    }
    const roleDiff = roleOrder[a.role] - roleOrder[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.username.localeCompare(b.username);
  });
}

/**
 * Ensure the singleton channel exists and tracks the given user.
 * No-op if the same user is already being tracked.
 */
function ensureChannel(profile: {
  user_id: string;
  username: string;
  role: string;
  dept_id: number | null;
  dept_code: string | null;
  dept_name: string | null;
}) {
  // Already tracking this user — nothing to do
  if (store.channel && store.currentUserId === profile.user_id) return;

  // Different user? Tear down first.
  if (store.channel) {
    store.channel.unsubscribe();
    store.channel = null;
    store.currentUserId = null;
    store.lastState = { onlineUsers: [], isConnected: false };
    emit();
  }

  const channel = supabase.channel(CHANNEL_NAME, {
    config: {
      presence: { key: profile.user_id },
    },
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const flat = Object.values(state).flat() as Array<
      Record<string, unknown>
    >;
    store.lastState = {
      onlineUsers: sortAndDedupe(flat, profile.user_id),
      isConnected: true,
    };
    emit();
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      store.lastState = { ...store.lastState, isConnected: true };
      emit();
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
      store.lastState = { ...store.lastState, isConnected: false };
      emit();
    }
  });

  store.channel = channel;
  store.currentUserId = profile.user_id;
}

/**
 * Tear down the channel. Called when the last React subscriber unmounts.
 */
function destroyChannel() {
  if (store.channel) {
    store.channel.unsubscribe();
    store.channel = null;
    store.currentUserId = null;
    store.lastState = { onlineUsers: [], isConnected: false };
    emit();
  }
}

// ═══════════════════════════════════════════════════════════
// React hook
// ═══════════════════════════════════════════════════════════

export function useOnlineUsers(): UseOnlineUsersResult {
  const profile = useAuthStore((s) => s.profile);
  const [state, setState] = useState(store.lastState);

  useEffect(() => {
    if (!profile) {
      // No profile → just consume the current empty state
      setState({ onlineUsers: [], isConnected: false });
      return;
    }

    // Register listener
    const listener: Listener = (next) => setState(next);
    store.listeners.add(listener);

    // Sync with the store's current value in case it's already populated
    setState(store.lastState);

    // Ensure the singleton channel is tracking this user
    ensureChannel({
      user_id: profile.user_id,
      username: profile.username,
      role: profile.role,
      dept_id: profile.dept_id,
      dept_code: profile.dept_code,
      dept_name: profile.dept_name,
    });

    return () => {
      store.listeners.delete(listener);
      // If nobody is listening, tear down the channel
      if (store.listeners.size === 0) {
        destroyChannel();
      }
    };
  }, [
    profile?.user_id,
    profile?.username,
    profile?.role,
    profile?.dept_id,
    profile?.dept_code,
    profile?.dept_name,
  ]);

  return {
    onlineUsers: state.onlineUsers,
    isConnected: state.isConnected,
    count: state.onlineUsers.length,
  };
}