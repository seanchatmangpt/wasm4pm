# Reference: Docker Deployment

## Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

RUN npm install -g @wasm4pm/pmctl

COPY config.toml /app/

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["wasm4pm-service", "--port", "3001"]
```

## Build and Run

```bash
# Build image
docker build -t wasm4pm:26.4.5 .

# Run container
docker run -p 3001:3001 \
  -v $(pwd)/config.toml:/config.toml:ro \
  -v $(pwd)/data:/data:ro \
  -v $(pwd)/output:/output \
  wasm4pm:26.4.5
```

## Docker Compose

```yaml
version: '3.8'

services:
  wasm4pm:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./config.toml:/config.toml:ro
      - ./data:/data:ro
      - ./output:/output
    environment:
      - WASM4PM_LOG_LEVEL=info
      - WASM4PM_PROFILE=balanced
    restart: unless-stopped

  # Optional: observability
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

## Multi-Stage Build

```dockerfile
# Build stage
FROM node:20 as builder
WORKDIR /build
RUN npm install -g @wasm4pm/pmctl

# Runtime stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/node_modules/@wasm4pm \
  /usr/local/lib/node_modules/@wasm4pm
COPY config.toml /app/
EXPOSE 3001
CMD ["wasm4pm-service"]
```

## Kubernetes Deployment

See [Reference: Kubernetes](./kubernetes.md)

## Environment Variables

```dockerfile
ENV WASM4PM_LOG_LEVEL=info
ENV WASM4PM_PROFILE=balanced
ENV WASM4PM_OTEL_ENABLED=true
ENV WASM4PM_OTEL_ENDPOINT=http://jaeger:4318
```

## See Also

- [How-To: Docker Deployment](../how-to/docker-deploy.md)
- [Reference: Kubernetes](./kubernetes.md)
