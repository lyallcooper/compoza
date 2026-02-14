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

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)throw r})"

CMD ["node", "server/index.js"]
