# How-To: Debug Configuration Errors

**Time required**: 10 minutes  
**Difficulty**: Intermediate  

## Validate Configuration

```bash
pmctl init --validate config.toml
```

Output on error:

```
[ERROR] Config validation failed
[ERROR] Field 'discovery.algorithm' = "unknown_algo"
[ERROR] Valid values: dfg, alpha, heuristic, inductive, genetic, ilp, ...
```

## Check Schema

Explain configuration requirements:

```bash
pmctl explain --config config.toml --mode brief
```

Output:

```
Configuration Schema
====================

[discovery]
  algorithm (required): string
    Valid: dfg, alpha, heuristic, ...
  profile (optional): string = "balanced"
    Valid: fast, balanced, quality, stream
  timeout_ms (optional): number = 300000

[source]
  type (required): string
    Valid: file, http, stream, inline
  path (required): string
    path to event log file
```

## Enable Debug Logging

```bash
WASM4PM_DEBUG=1 pmctl run --config config.toml --verbose
```

Output:

```
[DEBUG] Loading config from: config.toml
[DEBUG] Parsed: algorithm = "dfg"
[DEBUG] Parsed: profile = "fast"
[DEBUG] Source type: file
[DEBUG] Source path: sample.xes exists: true
[DEBUG] Resolving env vars...
[DEBUG] Final config hash: blake3:a7f3e2c9
```

## Check Environment Variables

View resolved values:

```bash
pmctl explain --config config.toml --expand-env
```

## Common Errors

### Missing Required Field

Error:
```
CONFIG_ERROR: Required field 'source.path' missing
```

Fix:
```toml
[source]
path = "your-file.xes"  # Add this
```

### Invalid Algorithm

Error:
```
CONFIG_ERROR: Unknown algorithm 'xyz'
```

Fix:
```toml
[discovery]
algorithm = "heuristic"  # Use valid algorithm
```

### File Not Found

Error:
```
SOURCE_ERROR: File not found: sample.xes
```

Fix:
```bash
# Check file exists
ls -la sample.xes

# Update path in config
# or move file to correct location
```

## Inspect Config Resolution

See how config is resolved from multiple sources:

```bash
pmctl explain --config config.toml --show-provenance
```

Output:

```
Configuration Sources (in precedence order):
1. TOML file: config.toml
   - algorithm = "dfg" (from file)
   - timeout_ms = 30000 (from file)

2. Environment variables:
   - profile = "fast" (from WASM4PM_PROFILE)

3. Command-line flags:
   - verbose = true (from --verbose)

4. Defaults:
   - retry_count = 3 (default)

Final Config Hash: blake3:a7f3e2c9d1b5e8f4
```

## Dry Run

Validate without executing:

```bash
pmctl run --config config.toml --dry-run
```

Output:

```
[INFO] Dry run mode enabled
[INFO] Config valid ✓
[INFO] Source accessible ✓
[INFO] Sink writable ✓
[INFO] All checks passed
[INFO] Would execute: dfg algorithm with fast profile
```

## See Also

- [Reference: Config Schema](../reference/config-schema.md)
- [Explanation: Config Resolution](../explanation/config-resolution.md)
- [Reference: Error Codes](../reference/error-codes.md)
