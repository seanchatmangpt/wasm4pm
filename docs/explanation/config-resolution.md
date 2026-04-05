# Explanation: Configuration Resolution

**Time to read**: 15 minutes  
**Level**: Intermediate  

## Multi-Source Loading

wasm4pm loads config from multiple sources in **precedence order**:

```
1. Command-line flags       (highest priority)
   ↓
2. Environment variables
   ↓
3. Configuration file (TOML/JSON)
   ↓
4. Defaults              (lowest priority)
```

### Example

```bash
# Default: fast profile
# TOML: balanced profile
# Env var: quality profile
# CLI flag: stream profile

WASM4PM_PROFILE=quality pmctl run --config config.toml --profile stream

# Final result: stream (CLI wins)
```

## Provenance Tracking

Every configuration value tracks its origin:

```bash
pmctl explain --config config.toml --show-provenance
```

Output:

```
Configuration Sources
====================

discovery.algorithm
  → From: config.toml (line 12)
  → Value: "heuristic"

discovery.profile
  → From: Environment (WASM4PM_PROFILE)
  → Value: "balanced"

discovery.timeout_ms
  → From: Default
  → Value: 300000
```

## Environment Variable Substitution

In TOML/JSON, use `${VAR}` syntax:

```toml
[source]
path = "${EVENT_LOG_PATH}"

[sink]
directory = "${OUTPUT_DIR}"

[observability.otel]
endpoint = "${OTEL_ENDPOINT}"
headers = {
  "DD-API-KEY" = "${DD_API_KEY}"
}
```

At runtime:

```bash
export EVENT_LOG_PATH="/mnt/data/events.xes"
export OUTPUT_DIR="/mnt/output"
export DD_API_KEY="sk-123..."

pmctl run --config config.toml
```

## Schema Validation

Configuration is validated against Zod schema:

```typescript
// Internal schema definition
const ConfigSchema = z.object({
  discovery: z.object({
    algorithm: z.enum(['dfg', 'alpha', 'heuristic', ...]),
    profile: z.enum(['fast', 'balanced', 'quality', 'stream']),
    timeout_ms: z.number().min(1000).max(3600000)
  }),
  source: z.object({
    type: z.enum(['file', 'http', 'stream', 'inline']),
    path: z.string().optional()
  })
  // ... more fields
});
```

Validation errors:

```
CONFIG_ERROR: discovery.algorithm
  Expected one of: dfg, alpha, heuristic, ...
  Got: "unknown_algo"
```

## Include Directive

Base configuration can be extended:

```toml
# config/dev.toml
include = "config/base.toml"

[discovery]
algorithm = "dfg"  # Override
profile = "fast"   # Override
# timeout_ms inherited from base
```

Precedence in includes:

```
Base defaults
  ↓
Include 1
  ↓
Include 2
  ↓
Current file
```

## Merging Rules

When merging configs:

```toml
# base.toml
[discovery]
timeout_ms = 300000

[sink]
format = "json"
overwrite = "skip"
```

```toml
# dev.toml
include = "base.toml"

[discovery]
algorithm = "dfg"  # Add new
# timeout_ms inherited

[sink]
overwrite = "overwrite"  # Override
# format inherited
```

Result:

```toml
[discovery]
algorithm = "dfg"      # From dev
timeout_ms = 300000    # From base

[sink]
format = "json"        # From base
overwrite = "overwrite" # From dev
```

## Immutability Guarantee

Configuration is **immutable** during execution:

```
Config → Hash → Execution
           ↓
        Locked (cannot change)

# If needed to change:
# Stop execution → Change config → Run again
```

Benefits:
- ✅ Determinism (no mid-execution changes)
- ✅ Debugging (config is fixed)
- ✅ Auditability (config change = new execution)

## Default Resolution Example

```bash
# No config provided
pmctl run

# Resolution:
# 1. Check CLI flags: --config? No
# 2. Check env var: WASM4PM_CONFIG_FILE? No
# 3. Check current dir: ./config.toml? No
# 4. Check home dir: ~/.wasm4pm/config.toml? No
# 5. Use defaults: memory algo

# Error if required fields missing
CONFIG_ERROR: Required field 'source' missing
```

## See Also

- [Explanation: Execution Substrate](./execution-substrate.md)
- [How-To: Debug Config](../how-to/debug-config.md)
- [Reference: Config Schema](../reference/config-schema.md)
