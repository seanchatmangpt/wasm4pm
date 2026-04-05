# Multi-stage build for wasm4pm service

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy all packages
COPY packages ./packages
COPY wasm4pm ./wasm4pm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build all packages
RUN pnpm run build

# Build service package specifically
WORKDIR /app/packages/service
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Install only production dependencies
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy built service
COPY --from=builder /app/packages/service/dist ./packages/service/dist
COPY --from=builder /app/packages/service/package.json ./packages/service/package.json
COPY --from=builder /app/packages/engine/dist ./packages/engine/dist
COPY --from=builder /app/packages/engine/package.json ./packages/engine/package.json
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json

# Install production dependencies only
RUN cd packages/service && npm install --production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/status', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start service
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

CMD ["node", "packages/service/dist/bin.js"]
