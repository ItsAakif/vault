// Wraps the stock Prisma adapter so NextAuth can persist OAuth accounts against this schema.
// Two schema facts force the createUser override (ADR-007 D2):
//   - User has `avatar`, not `image`; NextAuth's normalized profile supplies `image`.
//   - User.emailVerified is a non-nullable Boolean; NextAuth supplies `emailVerified: null`.
// Server-only: must never be imported from a 'use client' module.
import type { Adapter } from 'next-auth/adapters'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { db } from '@/lib/db'

export function createAuthAdapter(): Adapter {
  const base = PrismaAdapter(db)
  return {
    ...base,
    async createUser(profile) {
      const row = await db.user.create({
        data: {
          email: profile.email,
          name: profile.name ?? undefined,
          avatar: profile.image ?? undefined,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          // register/ and POST /api/auth/google both create preferences; the UI expects them.
          preferences: {
            create: { theme: 'system', language: 'en', timezone: 'UTC' },
          },
        },
      })
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        image: row.avatar,
        emailVerified: row.emailVerified ? new Date() : null,
      }
    },
  }
}
