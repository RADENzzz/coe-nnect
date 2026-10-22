import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { resolveSocketOrigin } from '../lib/api-base';

// ────────────────────────────────────────────
// Context shape
// ────────────────────────────────────────────

interface NotificationSocketContextValue {
  /** Underlying socket, or null if not yet connected. */
  socket: Socket | null;
  /** True once the server acknowledges the handshake. */
  isConnected: boolean;
  /**
   * Register a listener for a server-emitted event.
   * Returns an unsubscribe function. Safe to call before the socket
   * is ready — the listener will be attached on connect.
   */
  subscribe: <T = unknown>(
    event: string,
    handler: (payload: T) => void,
  ) => () => void;
}

const NotificationSocketContext =
  createContext<NotificationSocketContextValue | null>(null);

// ────────────────────────────────────────────
// URL resolution
// ────────────────────────────────────────────

/**
 * Socket.IO connects to the origin of the API base, without any path prefix.
 *
 * - Absolute base (`http://localhost:3000/api`) → `http://localhost:3000`
 * - Relative base (`/api`, the proxy/tunnel setup) → the page's own origin
 *
 * Tunnel and LAN visitors also fall back to the page origin when the
 * configured API points at their own localhost. See `lib/api-base.ts`.
 */
function resolveSocketUrl(): string {
  return resolveSocketOrigin();
}

// ────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────

interface ProviderProps {
  children: React.ReactNode;
}

export function NotificationSocketProvider({ children }: ProviderProps) {
  const user = useAuthStore((s) => s.user);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Map of registered listeners, applied on (re)connect.
  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(
    new Map(),
  );

  // ── Connect on login, disconnect on logout ──
  useEffect(() => {
    const url = resolveSocketUrl();

    if (!user) {
      // Clean teardown
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Get the current session token so the handshake can authenticate.
    let cancelled = false;
    (async () => {
      // The API client holds an axios instance that already reads the
      // Supabase session token. For the socket we need the raw JWT.
      const { data } = await import('../api/client').then(async (mod) => {
        // The client module doesn't export the token, so we go through
        // Supabase directly. If you have a helper, swap this out.
        const { supabase } = await import('../lib/supabase');
        const session = await supabase.auth.getSession();
        return { data: session };
      });

      if (cancelled) return;

      const token = data.data.session?.access_token;
      if (!token) return;

      const s = io(url, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      s.on('connect', () => {
        setIsConnected(true);
      });

      s.on('disconnect', () => {
        setIsConnected(false);
      });

      s.on('connect_error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('[notifications] socket connect_error:', err.message);
        setIsConnected(false);
      });

      // Replay all registered listeners on this fresh socket.
      listenersRef.current.forEach((handlers, event) => {
        handlers.forEach((handler) => {
          s.on(event, handler as (...args: unknown[]) => void);
        });
      });

      socketRef.current = s;
      setSocket(s);
    })();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, [user]);

  // ── subscribe() implementation ──
  const subscribe = useCallback(
    <T = unknown,>(
      event: string,
      handler: (payload: T) => void,
    ): (() => void) => {
      const wrapped = handler as (payload: unknown) => void;

      // Track it so future reconnects can re-attach.
      let handlers = listenersRef.current.get(event);
      if (!handlers) {
        handlers = new Set();
        listenersRef.current.set(event, handlers);
      }
      handlers.add(wrapped);

      // Attach to the live socket if we have one.
      socketRef.current?.on(event, wrapped);

      return () => {
        handlers?.delete(wrapped);
        if (handlers && handlers.size === 0) {
          listenersRef.current.delete(event);
        }
        socketRef.current?.off(event, wrapped);
      };
    },
    [],
  );

  const value = useMemo<NotificationSocketContextValue>(
    () => ({ socket, isConnected, subscribe }),
    [socket, isConnected, subscribe],
  );

  return (
    <NotificationSocketContext.Provider value={value}>
      {children}
    </NotificationSocketContext.Provider>
  );
}

// ────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────

export function useNotificationSocket(): NotificationSocketContextValue {
  const ctx = useContext(NotificationSocketContext);
  if (!ctx) {
    // Outside the provider — return a harmless no-op so callers don't crash.
    return {
      socket: null,
      isConnected: false,
      subscribe: () => () => {},
    };
  }
  return ctx;
}
