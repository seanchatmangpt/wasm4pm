# Tutorial: Custom Configuration Workflows

**Time to complete**: 25 minutes  
**Level**: Intermediate  
**Audience**: DevOps and configuration-focused users  

## What You'll Learn

- Build multi-environment configs (dev/staging/prod)
- Use environment variables for secrets
- Profile-aware algorithm selection
- Parameterize for different event log sizes
- Version control configs safely

## Prerequisites

- wasm4pm installed
- Text editor
- Git (for version control)
- Basic shell knowledge

## Step 1: Create Base Configuration

Create `config.base.toml`:

```toml
# Base configuration shared across environments

[discovery]
# algorithm set per-environment
# profile set per-environment
timeout_ms = 300000

[source]
type = "file"
# path set per-environment
format = "xes"
watch = false

[sink]
type = "file"
# directory set per-environment
format = "json"
overwrite = "skip"

[observability]
level = "info"  # will be overridden in dev
# otel settings per-environment
```

## Step 2: Environment-Specific Configs

### Development

Create `config.dev.toml`:

```toml
# Development: fast iteration, detailed logging

include = "config.base.toml"

[discovery]
algorithm = "dfg"
profile = "fast"
timeout_ms = 60000

[source]
path = "./data/sample-small.xes"

[sink]
directory = "./output/dev"

[observability]
level = "debug"

[observability.otel]
enabled = false  # Disable telemetry in dev
```

### Staging

Create `config.staging.toml`:

```toml
# Staging: realistic testing, moderate tracing

include = "config.base.toml"

[discovery]
algorithm = "heuristic"
profile = "balanced"

[source]
path = "./data/sample-medium.xes"

[sink]
directory = "./output/staging"

[observability]
level = "info"

[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "http://jaeger:4318"
```

### Production

Create `config.prod.toml`:

```toml
# Production: optimized, high observability

include = "config.base.toml"

[discovery]
algorithm = "genetic"
profile = "quality"
timeout_ms = 300000

[source]
path = "${EVENT_LOG_PATH}"  # Set via env var
watch = true
checkpoint_dir = "/var/cache/wasm4pm/checkpoints"

[sink]
directory = "${OUTPUT_DIR}"  # Set via env var

[observability]
level = "warn"

[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "${OTEL_ENDPOINT}"
headers = {
  "DD-API-KEY" = "${DD_API_KEY}"
}

[observability.redaction]
enabled = true
patterns = ["api_key", "password", "secret"]
```

## Step 3: Use Environment Variables

Set defaults at runtime:

```bash
# Development
export ENVIRONMENT=dev
export EVENT_LOG_PATH="./data/sample-small.xes"
export OUTPUT_DIR="./output/dev"
pmctl run --config config.${ENVIRONMENT}.toml

# Production
export ENVIRONMENT=prod
export EVENT_LOG_PATH="/mnt/data/events.xes"
export OUTPUT_DIR="/mnt/output"
export OTEL_ENDPOINT="https://api.datadoghq.com/v1/input"
export DD_API_KEY="your-secret-key"
pmctl run --config config.${ENVIRONMENT}.toml
```

## Step 4: Profile-Aware Selection

Create `config-profiles.toml` with algorithm matrix:

```toml
[discovery]
# Let profile determine algorithm
profile = "fast"  # Will be overridden by CLI or ENV

# Mapping: profile -> algorithm
[discovery.profile_algorithms]
fast = "dfg"
balanced = "heuristic"
quality = "genetic"
research = "ilp"

[discovery.profile_params]
# Fast profile
[discovery.profile_params.fast]
timeout_ms = 30000
algorithm = "dfg"

# Balanced profile
[discovery.profile_params.balanced]
timeout_ms = 60000
algorithm = "heuristic"
noise_threshold = 0.2

# Quality profile
[discovery.profile_params.quality]
timeout_ms = 300000
algorithm = "genetic"
population_size = 100
generations = 50

# Research profile
[discovery.profile_params.research]
timeout_ms = 600000
algorithm = "ilp"
timeout_search = 300000
```

Usage:

```bash
# Fast discovery
pmctl run --config config-profiles.toml --profile fast

# Quality discovery
pmctl run --config config-profiles.toml --profile quality
```

## Step 5: Size-Based Parameterization

Create adaptive config:

```toml
[discovery]
algorithm = "heuristic"
profile = "balanced"

# Parameters adapt to input size
[discovery.size_parameters]
# Small logs: <1000 events
[discovery.size_parameters.small]
timeout_ms = 30000
population_size = 20
generations = 10

# Medium logs: 1000-10000 events
[discovery.size_parameters.medium]
timeout_ms = 60000
population_size = 50
generations = 25

# Large logs: 10000-100000 events
[discovery.size_parameters.large]
timeout_ms = 300000
population_size = 100
generations = 50

# Extra large logs: >100000 events
[discovery.size_parameters.xlarge]
timeout_ms = 600000
population_size = 200
generations = 100
filter_enabled = true
filter_infrequent_threshold = 0.01
```

## Step 6: Feature Flags

Control behavior via configuration:

```toml
[features]
determinism_checking = true
receipt_generation = true
html_report = true
watch_mode = true
stream_processing = true

[features.experimental]
object_centric_mining = false
distributed_processing = false
incremental_updates = true
```

Usage in code:

```bash
# Check if feature enabled
if [ "$(grep 'object_centric_mining' config.toml | grep true)" ]; then
  echo "OCPM enabled"
fi
```

## Step 7: Version Control Setup

Create `.gitignore`:

```
# Don't commit secrets
*.env
.env.local
config.prod.toml      # Production credentials
secrets/

# Don't commit outputs
output/
.checkpoints/
*.log

# Cache
.cache/
node_modules/
```

Create config template:

Create `config.prod.toml.example`:

```toml
# Production configuration template
# IMPORTANT: Update environment variables before using

include = "config.base.toml"

[discovery]
algorithm = "genetic"
profile = "quality"

[source]
path = "${EVENT_LOG_PATH}"  # Set this env var

[sink]
directory = "${OUTPUT_DIR}"  # Set this env var

[observability.otel]
endpoint = "${OTEL_ENDPOINT}"
headers = {
  "DD-API-KEY" = "${DD_API_KEY}"  # Set this secret
}
```

Commit template, not actual config:

```bash
git add config.base.toml config.dev.toml config.staging.toml config.prod.toml.example
git add .gitignore
git commit -m "feat: add multi-environment configuration"
```

## Step 8: Docker Compose for Multi-Environment

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  wasm4pm-dev:
    image: wasm4pm:26.4.5
    environment:
      - ENVIRONMENT=dev
      - EVENT_LOG_PATH=/data/sample.xes
    volumes:
      - ./config.dev.toml:/config.toml:ro
      - ./data:/data:ro
      - ./output/dev:/output
    ports:
      - "3001:3001"

  wasm4pm-staging:
    image: wasm4pm:26.4.5
    environment:
      - ENVIRONMENT=staging
      - EVENT_LOG_PATH=/data/sample-medium.xes
    volumes:
      - ./config.staging.toml:/config.toml:ro
      - ./data:/data:ro
      - ./output/staging:/output
    ports:
      - "3002:3001"

  wasm4pm-prod:
    image: wasm4pm:26.4.5
    environment:
      - ENVIRONMENT=prod
      - EVENT_LOG_PATH=${EVENT_LOG_PATH}
      - OUTPUT_DIR=${OUTPUT_DIR}
      - OTEL_ENDPOINT=${OTEL_ENDPOINT}
      - DD_API_KEY=${DD_API_KEY}
    volumes:
      - ./config.prod.toml:/config.toml:ro
      - ${EVENT_LOG_PATH}:${EVENT_LOG_PATH}:ro
      - ${OUTPUT_DIR}:${OUTPUT_DIR}
    ports:
      - "3003:3001"
```

Run all environments:

```bash
docker-compose up -d

# View logs per environment
docker-compose logs wasm4pm-dev
docker-compose logs wasm4pm-staging
docker-compose logs wasm4pm-prod
```

## Step 9: Configuration as Code Pattern

Create `config-builder.sh`:

```bash
#!/bin/bash

build_config() {
  local env=$1
  local output="config.$env.toml"

  cat > "$output" << EOF
include = "config.base.toml"

[discovery]
algorithm = "${ALGORITHM:-dfg}"
profile = "${PROFILE:-fast}"
timeout_ms = ${TIMEOUT_MS:-30000}

[source]
path = "${SOURCE_PATH:-./data/sample.xes}"

[sink]
directory = "${SINK_DIR:-./output/$env}"

[observability]
level = "${LOG_LEVEL:-info}"
EOF

  echo "Generated $output"
}

# Usage
export ALGORITHM=heuristic PROFILE=balanced TIMEOUT_MS=60000 SOURCE_PATH=./data/medium.xes
build_config staging

export ALGORITHM=genetic PROFILE=quality TIMEOUT_MS=300000
build_config prod
```

## Step 10: Configuration Documentation

Create `CONFIG.md`:

```markdown
# Configuration Guide

## Environments

### Development (config.dev.toml)
- Algorithm: DFG (fastest)
- Logging: DEBUG
- OTEL: Disabled
- Use when: Iterating locally

### Staging (config.staging.toml)
- Algorithm: Heuristic (balanced)
- Logging: INFO
- OTEL: Enabled (Jaeger)
- Use when: Testing before production

### Production (config.prod.toml)
- Algorithm: Genetic (best quality)
- Logging: WARN (performance)
- OTEL: Enabled (DataDog)
- Use when: Running at scale

## Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| EVENT_LOG_PATH | Yes (prod) | /mnt/data/events.xes |
| OUTPUT_DIR | Yes (prod) | /mnt/output |
| OTEL_ENDPOINT | Yes (prod) | https://api.datadoghq.com |
| DD_API_KEY | Yes (prod) | sk-... |
```

## Next Steps

1. **Version control**: [How-To: Version Control Config](../how-to/version-control.md)
2. **Docker deployment**: [How-To: Docker Deployment](../how-to/docker-deploy.md)
3. **OTEL setup**: [Tutorial: Observability Setup](./observability-setup.md)

---

## Related Documentation

- **[Reference: Config Schema](../reference/config-schema.md)** — Complete schema
- **[Explanation: Config Resolution](../explanation/config-resolution.md)** — How resolution works
- **[How-To: Environment Variables](../how-to/environment-variables.md)** — Env var reference
