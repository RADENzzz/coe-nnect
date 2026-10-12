import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SupabaseService } from '../../database/supabase.service';

/**
 * WebSocket gateway for real-time notification push.
 *
 * Handshake:
 *   1. Client connects with `auth: { token: '<jwt>' }` in the connect payload
 *   2. We verify the JWT against Supabase auth
 *   3. On success, the socket joins the room `user:<userId>`
 *   4. The dispatcher pushes events to that room
 *
 * On failure, the connection is closed with an error.
 *
 * Transport: socket.io (auto-reconnect, rooms, polling fallback all free).
 * CORS: mirrors the HTTP CORS origins from main.ts.
 */
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      // Mirror the HTTP CORS logic
      if (!origin) return callback(null, true);

      const envOrigins = (
        process.env.FRONTEND_URL ?? 'http://localhost:5173'
      )
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (envOrigins.includes(origin)) return callback(null, true);

      const isVercel = /^https:\/\/.*\.vercel\.app$/.test(origin);
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const isLanIp =
        /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin);

      if (isVercel || isLocalhost || isLanIp) return callback(null, true);

      callback(new Error(`WS origin ${origin} not allowed`));
    },
    credentials: true,
  },
  // Namespace: default. If we later add other real-time features,
  // consider splitting into namespaces.
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly supabase: SupabaseService) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.query?.token as string | undefined);

      if (!token) {
        this.logger.warn(
          `WS connect rejected (no token) from ${socket.id}`,
        );
        socket.emit('auth_error', { message: 'Missing auth token' });
        socket.disconnect(true);
        return;
      }

      // Verify against Supabase auth
      const { data, error } = await this.supabase
        .getAdminClient()
        .auth.getUser(token);

      if (error || !data?.user?.id) {
        this.logger.warn(
          `WS connect rejected (invalid token) from ${socket.id}: ${error?.message}`,
        );
        socket.emit('auth_error', { message: 'Invalid auth token' });
        socket.disconnect(true);
        return;
      }

      const userId = data.user.id;

      // Join the user's private room — the dispatcher pushes here
      await socket.join(`user:${userId}`);

      // Stash userId on the socket for disconnect logging
      (socket.data as Record<string, unknown>).userId = userId;

      this.logger.log(`WS connected: user=${userId} socket=${socket.id}`);
      socket.emit('connected', { userId });
    } catch (err) {
      this.logger.error(
        `WS handshake error: ${(err as Error).message}`,
        (err as Error).stack,
      );
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const userId = (socket.data as Record<string, unknown>)?.userId;
    this.logger.log(
      `WS disconnected: user=${userId ?? 'unknown'} socket=${socket.id}`,
    );
  }

  // ════════════════════════════════════════════
  // Public API — called by the dispatcher
  // ════════════════════════════════════════════

  /**
   * Push a notification event to a specific user.
   * Returns true if at least one socket was in the room.
   */
  pushToUser(userId: string, event: string, payload: unknown): boolean {
    if (!this.server) return false;

    const room = this.server.sockets.adapter.rooms.get(`user:${userId}`);
    const hadListeners = !!room && room.size > 0;

    this.server.to(`user:${userId}`).emit(event, payload);

    return hadListeners;
  }

  /**
   * Push the updated unread count (so the bell badge updates instantly).
   */
  pushUnreadCount(userId: string, count: number): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('unread_count', { count });
  }
}