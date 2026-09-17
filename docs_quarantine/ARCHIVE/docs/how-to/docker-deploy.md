<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/docs/how-to/docker-deploy.md; source-sha256: f19bcd758bb02099dd54209f88387dcb8ce5ff8b452ded9b20c67368e64f2dd7; reason: tooling or agent control surface -->

# How-To: Deploy wasm4pm Service with Docker

**Time required**: 15 minutes  
**Difficulty**: Intermediate  

## Basic Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install wasm4pm
RUN npm install -g @wasm4pm/cli

# Copy config
COPY config.toml /app/

EXPOSE 3001

CMD ["wasm4pm-service", "--port", "3001"]
```

Build and run:

```bash
docker build -t wasm4pm:26.4.5 .
docker run -p 3001:3001 wasm4pm:26.4.5
```

## Docker Compose

```yaml
version: '3.8'

services:
  wasm4pm:
    image: wasm4pm:26.4.5
    ports:
      - "3001:3001"
    volumes:
      - ./config.toml:/config.toml:ro
      - ./data:/data:ro
      - ./output:/output
    environment:
      - WASM4PM_LOG_LEVEL=info
      - WASM4PM_OTEL_ENABLED=true
      - WASM4PM_OTEL_ENDPOINT=http://jaeger:4318

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "4317:4317"
```

Start:

```bash
docker-compose up -d
```

## With Volume Mounts

```bash
docker run -d \
  --name wasm4pm \
  -p 3001:3001 \
  -v $(pwd)/config.toml:/config.toml:ro \
  -v $(pwd)/data:/data:ro \
  -v $(pwd)/output:/output \
  -e WASM4PM_LOG_LEVEL=debug \
  wasm4pm:26.4.5
```

## Health Check

```dockerfile
FROM node:20-slim

WORKDIR /app
RUN npm install -g @wasm4pm/cli

COPY config.toml /app/

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001
CMD ["wasm4pm-service", "--port", "3001"]
```

## Multi-Stage Build

```dockerfile
# Build stage
FROM node:20 as builder
WORKDIR /build
RUN npm install -g @wasm4pm/cli

# Runtime stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/node_modules/@wasm4pm /usr/local/lib/node_modules/@wasm4pm
COPY config.toml /app/
EXPOSE 3001
CMD ["wasm4pm-service"]
```

## See Also

- [How-To: Kubernetes Deployment](./kubernetes-deploy.md)
- [Tutorial: Service Mode](../tutorials/service-mode.md)
