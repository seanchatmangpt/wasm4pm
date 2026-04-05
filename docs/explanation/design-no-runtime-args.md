# Explanation: Why No Runtime Arguments

**Time to read**: 10 minutes  
**Level**: Advanced  

## The Core Principle

**"If execution requires arguments, the system is incorrectly designed"**

This means: All parameters should be in configuration, not command-line arguments.

## Why Configuration > CLI Arguments

### 1. Reproducibility

```bash
# Bad (CLI args):
pmctl run --algorithm heuristic --noise-threshold 0.2 --population 50
# Did we remember all the flags? Are they documented?

# Good (config file):
pmctl run --config config.toml
# Everything explicit, version-controlled
```

### 2. Discoverability

```bash
# Bad: Arguments scattered across shell history
history | grep pmctl | grep -v config

# Good: All parameters in single config file
cat config.toml | grep -A10 discovery
```

### 3. Auditability

```bash
# Bad: Who changed what? When? Why?
git log --oneline  # Only shows commits, not CLI args

# Good: Every parameter change tracked
git log --oneline config.toml
git show <commit>:config.toml
```

### 4. Binding Early vs Late

```
Early Binding (good):
  config.toml → [all params fixed] → execute

Late Binding (bad):
  execute → [look for CLI args/env vars] → continue → [inconsistent]
```

## What Arguments We Still Support

We support **minimal** flags for convenience:

```bash
# Flag overrides config (exception)
pmctl run --config config.toml --profile fast

# Profile = template for algorithm selection
# (But specific algorithm in config.toml)
```

Minimal flags:
- `--config FILE` (which config to use)
- `--profile PROFILE` (which preset to use)
- `--verbose` (logging level)
- `--dry-run` (validate without executing)

**Not supported** (must be in config):
- ❌ `--algorithm heuristic` (use config)
- ❌ `--timeout 30000` (use config)
- ❌ `--source-path data.xes` (use config)

## Configuration-Driven Design

Benefits accumulate:

```
Config-driven ↓

1. Single source of truth
2. Version control
3. Reproducibility
4. Auditability
5. Rollback (git revert)
6. A/B testing (branched configs)
7. Documentation (config is self-documenting)
8. Compliance (full audit trail)
```

## Example: Good Design

```toml
# config.toml (source of truth)
[discovery]
algorithm = "genetic"
population_size = 100
generations = 50
timeout_ms = 300000

[source]
path = "data/events.xes"

[sink]
directory = "output"
```

Execution:

```bash
# No arguments needed
pmctl run --config config.toml

# Optionally override profile
pmctl run --config config.toml --profile fast
```

## Example: Bad Design

```bash
# Many arguments (hard to remember, easy to mess up)
pmctl run \
  --config config.toml \
  --algorithm genetic \
  --population 100 \
  --generations 50 \
  --timeout 300000 \
  --source data/events.xes \
  --sink output
```

Problems:
- ✗ Arguments not version-controlled
- ✗ No audit trail
- ✗ Hard to reproduce
- ✗ Easy to make typos
- ✗ Documentation required

## Configuration as API

Instead of: "API is what the function signature accepts"

Think: "API is the configuration schema"

```typescript
// TypeScript doesn't need runtime args
const config = {
  discovery: {
    algorithm: 'genetic',
    population: 100
  }
};
await pm.run({ config });
```

## Immutability During Execution

Once execution starts, config is locked:

```
Config frozen → Execution proceeds → No mid-execution changes

Benefit: Determinism guarantee
```

## See Also

- [Explanation: Execution Substrate](./execution-substrate.md)
- [Explanation: Config Resolution](./config-resolution.md)
- [How-To: Debug Config](../how-to/debug-config.md)
