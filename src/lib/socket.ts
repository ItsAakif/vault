import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getToken } from 'next-auth/jwt';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

/**
 * The request object `next-auth/jwt#getToken` expects. The handshake request is a
 * plain `IncomingMessage`, which is assignment-compatible with the Next API request
 * shape getToken actually reads (`cookies` + `headers`), so a narrow cast is enough.
 */
type GetTokenRequest = Parameters<typeof getToken>[0]['req'];

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;

/**
 * Fail loudly when the secret is missing.
 *
 * There used to be a `|| 'fallback-secret'` here. That made socket auth a formality:
 * with the fallback in play anyone can mint a token this server accepts, so a missing
 * env var silently downgraded authentication to "always true". A server that cannot
 * verify credentials must refuse to start instead.
 */
export const getSocketAuthSecret = (): string => {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET is not set. Refusing to start Socket.IO authentication: ' +
        'without this variable session cookies and socket tokens cannot be verified, ' +
        'and the server will not fall back to a hardcoded secret.'
    );
  }

  return secret;
};

/** Parse a `Cookie:` header into a name -> value map. */
export const parseCookieHeader = (
  header: string | string[] | undefined
): Record<string, string> => {
  const raw = Array.isArray(header) ? header.join('; ') : header;
  const jar: Record<string, string> = {};

  if (!raw) return jar;

  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    if (!name) continue;

    const value = part.slice(separator + 1).trim();
    try {
      jar[name] = decodeURIComponent(value);
    } catch {
      // A malformed escape is not worth rejecting the handshake over here; the JWT
      // decode below is what actually decides, and it will fail closed.
      jar[name] = value;
    }
  }

  return jar;
};

/**
 * Pick the session cookie name present in the handshake.
 *
 * `getToken` derives this from `NEXTAUTH_URL` (secure prefix when the URL is https).
 * Reading it off the jar instead keeps development (`next-auth.session-token`) and a
 * production deployment (`__Secure-next-auth.session-token`) working without asking
 * the caller to configure it twice.
 */
const resolveSessionCookieName = (cookies: Record<string, string>): string => {
  const names = Object.keys(cookies);

  const hasSecureCookie = names.some((name) => {
    const secureName = SESSION_COOKIE_NAMES[1];
    return name === secureName || name.startsWith(`${secureName}.`);
  });

  return hasSecureCookie ? SESSION_COOKIE_NAMES[1] : SESSION_COOKIE_NAMES[0];
};

const hasSessionCookie = (cookies: Record<string, string>): boolean =>
  Object.keys(cookies).some((name) =>
    SESSION_COOKIE_NAMES.some(
      (cookieName) => name === cookieName || name.startsWith(`${cookieName}.`)
    )
  );

interface SocketTokenPayload {
  sub?: string;
  id?: string;
  email?: string;
}

/**
 * Authenticate one handshake: a signed `auth.token` (non-browser clients) or the
 * NextAuth session cookie the browser already sends with a same-origin websocket
 * handshake. Throws with a specific reason; the caller turns that into a
 * `connect_error` for the client.
 */
const authenticateHandshake = async (
  socket: AuthenticatedSocket,
  secret: string
): Promise<void> => {
  const authToken = socket.handshake?.auth?.token;

  if (typeof authToken === 'string' && authToken.length > 0) {
    try {
      const decoded = jwt.verify(authToken, secret) as SocketTokenPayload;
      const userId = decoded.sub || decoded.id;

      if (!userId) throw new Error('token has no subject');

      socket.userId = userId;
      socket.userEmail = decoded.email;
      return;
    } catch {
      // Fall through: a browser can never mint auth.token, so the cookie path below
      // may still authenticate the same handshake.
    }
  }

  const request = socket.request as { headers?: Record<string, string | string[] | undefined> };
  const cookies = parseCookieHeader(request?.headers?.cookie);

  // `next-auth` 4.x only reads `req.cookies` (Next parses it in API routes), and a raw
  // `IncomingMessage` has none, so hand getToken the parsed jar alongside the headers.
  const sessionToken = await getToken({
    req: {
      headers: request?.headers,
      cookies,
    } as unknown as GetTokenRequest,
    secret,
    cookieName: resolveSessionCookieName(cookies),
  });

  const userId = sessionToken?.sub ?? sessionToken?.id;

  if (!userId) {
    throw new Error(
      hasSessionCookie(cookies)
        ? 'Authentication error: session cookie could not be verified'
        : 'Authentication error: no session cookie or auth token was sent'
    );
  }

  socket.userId = String(userId);
  socket.userEmail = sessionToken?.email ?? undefined;
};

interface SyncMessage {
  type: 'content' | 'project' | 'job' | 'calendar' | 'tag' | 'category';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
}

export const setupSocket = (io: Server) => {
  // Resolve (and validate) the secret at startup, before any handshake can happen.
  // server.ts calls this while booting, so an unset variable stops the process with
  // this message instead of leaving a forgeable secret in production.
  const secret = getSocketAuthSecret();

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    // socket.io does not await middleware, so drive the async work into `next` here.
    void authenticateHandshake(socket, secret).then(
      () => next(),
      (error: unknown) => {
        const reason = error instanceof Error ? error.message : 'Authentication error';
        next(new Error(reason));
      }
    );
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('Client connected:', socket.id, 'User:', socket.userEmail);
    
    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Handle real-time sync messages
    socket.on('sync', (message: SyncMessage) => {
      // Broadcast to all other clients in the same user room
      socket.to(`user:${socket.userId}`).emit('sync', {
        ...message,
        senderId: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    // Handle content updates
    socket.on('content:update', (data) => {
      socket.to(`user:${socket.userId}`).emit('content:updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Handle project updates
    socket.on('project:update', (data) => {
      socket.to(`user:${socket.userId}`).emit('project:updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Handle job updates
    socket.on('job:update', (data) => {
      socket.to(`user:${socket.userId}`).emit('job:updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Handle calendar updates
    socket.on('calendar:update', (data) => {
      socket.to(`user:${socket.userId}`).emit('calendar:updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Handle typing indicators
    socket.on('typing:start', (data: { itemId: string; itemType: string }) => {
      socket.to(`user:${socket.userId}`).emit('typing:start', {
        ...data,
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('typing:stop', (data: { itemId: string; itemType: string }) => {
      socket.to(`user:${socket.userId}`).emit('typing:stop', {
        ...data,
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    // Handle cursor position for collaborative editing
    socket.on('cursor:move', (data: { itemId: string; position: number; selection: any }) => {
      socket.to(`user:${socket.userId}`).emit('cursor:moved', {
        ...data,
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    // Handle presence
    socket.on('presence:update', (data: { page: string; itemId?: string }) => {
      socket.to(`user:${socket.userId}`).emit('presence:updated', {
        ...data,
        userId: socket.userId,
        userEmail: socket.userEmail,
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      // Notify other clients about disconnection
      socket.to(`user:${socket.userId}`).emit('presence:disconnected', {
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to real-time sync server',
      timestamp: new Date().toISOString()
    });
  });

  // Handle server-wide events
  io.on('connection_error', (err) => {
    console.log('Connection error:', err.message);
  });
};

// Helper function to broadcast updates to all users
export const broadcastUpdate = (io: Server, type: string, action: string, data: any, excludeUserId?: string) => {
  io.emit('sync', {
    type,
    action,
    data,
    timestamp: new Date().toISOString()
  });
};

// Helper function to send update to specific user
export const sendUserUpdate = (io: Server, userId: string, type: string, action: string, data: any) => {
  io.to(`user:${userId}`).emit('sync', {
    type,
    action,
    data,
    timestamp: new Date().toISOString()
  });
};