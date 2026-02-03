# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Install Docker CLI only
RUN apk add --no-cache docker-cli docker-cli-compose

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build (includes minimal node_modules with Next.js bundled)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy custom server
COPY --from=builder /app/server ./server

# Generate server package.json from main package.json and install deps
COPY --from=builder /app/package.json /tmp/package.json
RUN node -e " \
  const pkg = require('/tmp/package.json'); \
  const serverDeps = ['dockerode', 'dotenv', 'socket.io', 'tsx']; \
  const deps = {}; \
  serverDeps.forEach(d => { if (pkg.dependencies[d]) deps[d] = pkg.dependencies[d]; }); \
  const serverPkg = { name: 'compoza-server', private: true, dependencies: deps }; \
  require('fs').writeFileSync('server/package.json', JSON.stringify(serverPkg, null, 2)); \
" && cd server && npm install --omit=dev

# Set environment
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Switch to non-root user
USER nextjs

EXPOSE 3000

CMD ["node", "--import", "./server/node_modules/tsx/dist/esm/index.mjs", "server/index.ts"]
