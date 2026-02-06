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

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Compile custom server to JavaScript
RUN npx tsc -p server/tsconfig.json

# Create a clean production-only deployment
RUN pnpm --filter . deploy --legacy --prod /app/prod

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Install Docker CLI
RUN apk add --no-cache docker-cli docker-cli-compose

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application with production-only dependencies
COPY --from=builder /app/prod/package.json ./
COPY --from=builder /app/prod/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy compiled server
COPY --from=builder /app/server/dist/index.js ./server/index.js

# Set environment
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV BIND_ADDRESS=0.0.0.0

# Switch to non-root user
USER nextjs

EXPOSE 3000

CMD ["node", "server/index.js"]
