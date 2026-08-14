# syntax=docker/dockerfile:1

# Production image for apps/web. See ADR 23.
#
# Built from the repository root, not from apps/web: this is a pnpm workspace
# and the app compiles its dependencies from source (ADR 1), so the build needs
# the whole workspace. `.dockerignore` is what keeps that from meaning "the
# whole working directory".
#
#   docker build -t fastehr-web .
#   docker run --rm -p 3000:3000 -e DATABASE_URL=postgresql://… fastehr-web

# Pinned to .nvmrc. Alpine is viable because Prisma 7 is Rust-free — there is no
# native query engine to match against musl, which is what used to make
# Alpine + Prisma a support question.
FROM node:26.3.1-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Corepack is installed explicitly: Node 26's images no longer bundle it, and
# `corepack enable` fails with "not found". It is worth the extra layer because
# corepack takes the pnpm version from `packageManager` in package.json — so
# the version stays pinned in exactly one place for CI, developers, and this
# image alike, rather than being restated here and drifting.
RUN npm install --global corepack@latest && corepack enable

# ---------------------------------------------------------------------------
# deps — install once, cached on the manifests alone
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /repo

# Only the files that can change the dependency graph. Source changes below
# this point therefore do not re-run the install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build — prisma generate, then next build
# ---------------------------------------------------------------------------
FROM base AS build
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /repo/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /repo/packages/db/node_modules ./packages/db/node_modules
COPY . .

# `NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so
# they are build arguments and not runtime configuration. An image built with
# one origin cannot be promoted to an environment that uses another.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

ENV NEXT_TELEMETRY_DISABLED=1

# `turbo run build` rather than `next build`, so the `^generate` edge runs
# prisma generate first (ADR 15). No DATABASE_URL is needed here: generate takes
# no connection, and validation is deferred to the first query (ADR 14).
RUN pnpm turbo run build --filter=@fastehr/web

# ---------------------------------------------------------------------------
# runner — the standalone server and nothing else
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /repo

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runs unprivileged. `node` (uid 1000) ships with the base image; the app writes
# nothing to disk, so it needs no ownership beyond read.
USER node

# `standalone` already contains the server and the traced subset of
# node_modules; `static` and `public` are served from disk and are not part of
# it. The paths keep the workspace layout because outputFileTracingRoot is the
# repository root.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

EXPOSE 3000

# Migrations are deliberately NOT run here. A container that migrates on start
# races every other replica and turns a rollout into a schema change; run
# `prisma migrate deploy` as its own step in the deployment (ADR 14).
CMD ["node", "apps/web/server.js"]
