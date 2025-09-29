# Dockerfile for X-Lochagos AI Social Media Agents
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY mvp/package*.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++
COPY mvp/package*.json ./
RUN npm ci

# Copy source code
COPY mvp/ ./

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 xlochagos

# Copy the built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Copy configuration files
COPY --from=builder /app/config ./config
COPY --from=builder /app/supabase ./supabase

# Install dependencies and rebuild native modules for Alpine Linux
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm rebuild better-sqlite3

# Create data and sessions directories
RUN mkdir -p ./data && chown xlochagos:nodejs ./data
RUN mkdir -p ./sessions && chown xlochagos:nodejs ./sessions

USER xlochagos

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "run", "start"]
