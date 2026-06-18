ARG NODE_VERSION=24
ARG DISTROLESS_DEBIAN_VERSION=12

FROM node:${NODE_VERSION}-bookworm-slim AS base

# 1. Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Production dependencies only (pruned from deps, no second install)
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --production

# 3. Build the source code
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm run build

# 4. Production image
FROM gcr.io/distroless/nodejs${NODE_VERSION}-debian${DISTROLESS_DEBIAN_VERSION}
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=ghcr.io/usu-accessibility/docker-tools:1 /bin/httpcheck /bin/httpcheck
EXPOSE 3000
CMD ["dist/index.js"]

HEALTHCHECK --interval=5s --timeout=3s --retries=5 CMD ["/bin/httpcheck", "http://localhost:3000/api"]