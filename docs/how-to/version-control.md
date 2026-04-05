# How-To: Version Control Config Safely

**Time required**: 10 minutes  
**Difficulty**: Beginner  

## What to Commit

```bash
# Safe to commit
git add config.toml config.dev.toml config.staging.toml
git add config.prod.toml.example   # Template, not secrets
git add .gitignore
git commit -m "feat: add configuration files"
```

## What NOT to Commit

Create `.gitignore`:

```
# Secrets
*.env
.env.local
.env.production
config.prod.toml        # Never commit production config

# API keys and credentials
secrets/
.secrets/
*.key
*.pem

# Sensitive data
*.log
.checkpoints/
output/

# Dependencies
node_modules/
```

## Production Config Template

Create `config.prod.toml.example`:

```toml
# Production Configuration Template
# Copy to config.prod.toml and update values

[discovery]
algorithm = "genetic"
profile = "quality"
timeout_ms = 300000

[source]
type = "file"
path = "${EVENT_LOG_PATH}"

[sink]
directory = "${OUTPUT_DIR}"

[observability.otel]
enabled = true
endpoint = "${OTEL_ENDPOINT}"
headers = {
  "DD-API-KEY" = "${DD_API_KEY}"
}
```

## Safe Configuration

```bash
# Store secrets in environment variables only
export EVENT_LOG_PATH="/mnt/secure/events.xes"
export OUTPUT_DIR="/mnt/output"
export DD_API_KEY="sk-..."

# Reference in config
pmctl run --config config.prod.toml
```

## Git Workflow

```bash
# 1. Clone
git clone https://github.com/org/repo.git

# 2. Create config from template
cp config.prod.toml.example config.prod.toml
# Edit with actual values

# 3. Verify it's ignored
git status
# Should NOT show config.prod.toml

# 4. Run safely
pmctl run --config config.prod.toml
```

## Audit Trail

Track config changes:

```bash
# See config history
git log --oneline -- config.toml

# View diff
git show <commit>:config.toml
```

## See Also

- [Tutorial: Compliance Audit](../tutorials/compliance-audit.md)
- [Tutorial: Custom Configs](../tutorials/custom-configs.md)
