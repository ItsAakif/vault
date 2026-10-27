# Vault Personal Command Center - Dockerfile
# Runtime model: `next build` + `tsx server.ts` (ADR-003 point 3).
# NOT the Next.js standalone output; the custom Socket.IO server in server.ts needs
# the full node_modules and the src/ tree at runtime.

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---------------------------------------------------------------------------
# builder: one install, generate Prisma client, build Next.js
# ---------------------------------------------------------------------------
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Prisma client must exist before `next build` compiles route handlers.
RUN npx prisma generate

# The app's Prisma datasource is sqlite and the path is only opened at runtime.
# A build-time value keeps any module-level PrismaClient construction working
# during `next build`; it is not the database the running image uses.
ENV DATABASE_URL=file:/app/data/vault.db

# NEXT_PUBLIC_* values are inlined into the browser bundle HERE, at build time.
# They cannot be supplied at `docker run` time. `docker-compose.yml` passes them
# as build args; without them the client falls back to http://localhost:3000 and
# realtime does not work in a deployed container.
ARG NEXT_PUBLIC_CUSTOM_SERVER=true
ARG NEXT_PUBLIC_SOCKET_URL=""
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_CUSTOM_SERVER=$NEXT_PUBLIC_CUSTOM_SERVER
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# runner: production image that runs `tsx server.ts`
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Default database location. It is inside the volume below, so a redeploy keeps
# the users, the Google link and the preferences. Override with DATABASE_URL if
# you mount the volume elsewhere.
ENV DATABASE_URL=file:/app/data/vault.db

# curl is absent from node:20-alpine but required by HEALTHCHECK below.
# openssl is what Prisma's schema engine links against on Alpine; without it the
# `prisma db push` in CMD can fail to start.
RUN apk add --no-cache curl openssl

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Application source and build output required by `tsx server.ts` and Next.js.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src ./src

# Full node_modules (production deps include next, tsx, socket.io, @prisma/client).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Config + entry point.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./server.ts

# Writable directory for the SQLite database (DATABASE_URL=file:/app/data/vault.db).
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# `prisma db push` creates or updates the schema in the volume-mounted SQLite
# file before the app opens it. Without this, a fresh volume holds an empty file
# and every database-backed request fails with "no such table". It is idempotent
# and a no-op once the schema matches.
CMD ["sh", "-c", "npx prisma db push --skip-generate && exec npx tsx server.ts"]
