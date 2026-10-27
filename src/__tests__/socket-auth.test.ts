// @vitest-environment node
//
// Server-side Socket.IO authentication. These tests exercise the real handshake
// middleware in src/lib/socket.ts, including a genuine NextAuth session JWT minted by
// `next-auth/jwt` (the same encoder the app itself uses), so "the cookie is accepted"
// is proven against the real decoder rather than a stub.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { encode } from 'next-auth/jwt'
import type { Server } from 'socket.io'
import {
  parseCookieHeader,
  setupSocket,
  type AuthenticatedSocket,
} from '@/lib/socket'

const TEST_SECRET = 'socket-auth-test-secret'
const originalSecret = process.env.NEXTAUTH_SECRET

type Middleware = (
  socket: AuthenticatedSocket,
  next: (error?: Error) => void
) => void

interface FakeServer {
  io: Server
  middleware: () => Middleware
  connectionHandlers: Array<(socket: AuthenticatedSocket) => void>
}

function createFakeServer(): FakeServer {
  let middleware: Middleware | undefined
  const connectionHandlers: Array<(socket: AuthenticatedSocket) => void> = []

  const io = {
    use: (fn: Middleware) => {
      middleware = fn
      return io
    },
    on: (event: string, handler: (socket: AuthenticatedSocket) => void) => {
      if (event === 'connection') connectionHandlers.push(handler)
      return io
    },
  }

  return {
    io: io as unknown as Server,
    middleware: () => {
      if (!middleware) throw new Error('no authentication middleware registered')
      return middleware
    },
    connectionHandlers,
  }
}

interface FakeSocket {
  socket: AuthenticatedSocket
  joined: string[]
  directEmit: Array<{ event: string; payload: any }>
  broadcasts: Array<{ room: string; event: string; payload: any }>
  handlers: Map<string, (payload?: any) => void>
}

function createFakeSocket(
  options: { auth?: Record<string, unknown>; cookie?: string } = {}
): FakeSocket {
  const joined: string[] = []
  const directEmit: Array<{ event: string; payload: any }> = []
  const broadcasts: Array<{ room: string; event: string; payload: any }> = []
  const handlers = new Map<string, (payload?: any) => void>()

  const socket = {
    id: 'socket-1',
    handshake: { auth: options.auth ?? {} },
    request: { headers: options.cookie ? { cookie: options.cookie } : {} },
    join: (room: string) => {
      joined.push(room)
    },
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        broadcasts.push({ room, event, payload })
      },
    }),
    emit: (event: string, payload: any) => {
      directEmit.push({ event, payload })
    },
    on: (event: string, handler: (payload?: any) => void) => {
      handlers.set(event, handler)
    },
  }

  return {
    socket: socket as unknown as AuthenticatedSocket,
    joined,
    directEmit,
    broadcasts,
    handlers,
  }
}

async function handshake(
  middleware: Middleware,
  socket: AuthenticatedSocket
): Promise<Error | undefined> {
  return new Promise((resolve) => {
    middleware(socket, (error?: Error) => resolve(error))
  })
}

function sessionCookie(token: string, name = 'next-auth.session-token'): string {
  return `${name}=${token}`
}

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = TEST_SECRET
})

afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env.NEXTAUTH_SECRET
  } else {
    process.env.NEXTAUTH_SECRET = originalSecret
  }
})

describe('Socket.IO handshake authentication', () => {
  it('accepts the NextAuth session cookie and joins the user room', async () => {
    const sessionToken = await encode({
      token: { id: 'user-42', sub: 'user-42', email: 'person@example.com' },
      secret: TEST_SECRET,
    })

    const server = createFakeServer()
    setupSocket(server.io)

    const fake = createFakeSocket({ cookie: sessionCookie(sessionToken) })
    const error = await handshake(server.middleware(), fake.socket)

    expect(error).toBeUndefined()

    server.connectionHandlers[0](fake.socket)

    expect(fake.joined).toEqual(['user:user-42'])
  })

  it('accepts the production __Secure- prefixed session cookie', async () => {
    const sessionToken = await encode({
      token: { id: 'user-secure', sub: 'user-secure', email: 'secure@example.com' },
      secret: TEST_SECRET,
    })

    const server = createFakeServer()
    setupSocket(server.io)

    const fake = createFakeSocket({
      cookie: sessionCookie(sessionToken, '__Secure-next-auth.session-token'),
    })
    const error = await handshake(server.middleware(), fake.socket)

    expect(error).toBeUndefined()

    server.connectionHandlers[0](fake.socket)
    expect(fake.joined).toEqual(['user:user-secure'])
  })

  it('still accepts a minted auth.token for non-browser clients', async () => {
    const token = jwt.sign({ sub: 'cli-user', email: 'cli@example.com' }, TEST_SECRET)

    const server = createFakeServer()
    setupSocket(server.io)

    const fake = createFakeSocket({ auth: { token } })
    const error = await handshake(server.middleware(), fake.socket)

    expect(error).toBeUndefined()

    server.connectionHandlers[0](fake.socket)
    expect(fake.joined).toEqual(['user:cli-user'])
  })

  it('rejects a handshake with no credentials', async () => {
    const server = createFakeServer()
    setupSocket(server.io)

    const fake = createFakeSocket()
    const error = await handshake(server.middleware(), fake.socket)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toMatch(/^Authentication error/)
    expect(fake.joined).toEqual([])
  })

  it('rejects an invalid auth.token, including one signed with the removed fallback secret', async () => {
    const server = createFakeServer()
    setupSocket(server.io)

    const forged = jwt.sign({ sub: 'attacker' }, 'fallback-secret')
    const forgedResult = await handshake(
      server.middleware(),
      createFakeSocket({ auth: { token: forged } }).socket
    )

    expect(forgedResult).toBeInstanceOf(Error)
    expect(forgedResult?.message).toMatch(/^Authentication error/)

    const garbageResult = await handshake(
      server.middleware(),
      createFakeSocket({ auth: { token: 'not-a-jwt' } }).socket
    )

    expect(garbageResult).toBeInstanceOf(Error)
    expect(garbageResult?.message).toMatch(/^Authentication error/)
  })

  it('fails loudly when NEXTAUTH_SECRET is missing instead of using a fallback', () => {
    delete process.env.NEXTAUTH_SECRET

    const server = createFakeServer()

    expect(() => setupSocket(server.io)).toThrow(/NEXTAUTH_SECRET/)
    // No middleware means no handshake can ever succeed with a guessed secret.
    expect(() => server.middleware()).toThrow(/no authentication middleware/)
  })

  it('rejects a session cookie minted with a secret the server does not use', async () => {
    const forgedSession = await encode({
      token: { id: 'attacker', sub: 'attacker' },
      secret: 'fallback-secret',
    })

    const server = createFakeServer()
    setupSocket(server.io)

    const fake = createFakeSocket({ cookie: sessionCookie(forgedSession) })
    const error = await handshake(server.middleware(), fake.socket)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toMatch(/Authentication error/)
    expect(fake.joined).toEqual([])
  })

  it('keeps the user room fan-out and senderId contract unchanged', async () => {
    const sessionToken = await encode({
      token: { id: 'user-7', sub: 'user-7', email: 'seven@example.com' },
      secret: TEST_SECRET,
    })

    const server = createFakeServer()
    setupSocket(server.io)

    const fake = createFakeSocket({ cookie: sessionCookie(sessionToken) })
    expect(await handshake(server.middleware(), fake.socket)).toBeUndefined()

    server.connectionHandlers[0](fake.socket)

    const sync = fake.handlers.get('sync')
    expect(sync).toBeTypeOf('function')

    sync?.({
      type: 'content',
      action: 'update',
      data: { id: 'doc-1' },
      timestamp: '2026-01-01T00:00:00.000Z',
    })

    expect(fake.broadcasts).toHaveLength(1)
    expect(fake.broadcasts[0]).toMatchObject({
      room: 'user:user-7',
      event: 'sync',
    })
    expect(fake.broadcasts[0].payload).toMatchObject({
      type: 'content',
      action: 'update',
      data: { id: 'doc-1' },
      senderId: 'socket-1',
    })
    expect(typeof fake.broadcasts[0].payload.timestamp).toBe('string')

    // The welcome message is still emitted straight to the connecting socket.
    expect(fake.directEmit[0]).toMatchObject({ event: 'connected' })
  })
})

describe('parseCookieHeader', () => {
  it('parses a cookie header, including chunked session cookies', () => {
    const jar = parseCookieHeader(
      'theme=dark; next-auth.session-token.0=abc; next-auth.session-token.1=def'
    )

    expect(jar).toEqual({
      theme: 'dark',
      'next-auth.session-token.0': 'abc',
      'next-auth.session-token.1': 'def',
    })
    expect(parseCookieHeader(undefined)).toEqual({})
  })
})
