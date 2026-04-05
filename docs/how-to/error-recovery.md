# How-To: Error Recovery

**Time required**: 15 minutes  
**Difficulty**: Intermediate  

## Common Errors

### CONFIG_ERROR (Exit 1)

```
Error: CONFIG_INVALID
```

Fix:

```bash
# Validate config
pmctl init --validate config.toml

# Check specific field
pmctl explain --config config.toml --mode verbose | grep -A5 "error"
```

### SOURCE_ERROR (Exit 2)

```
Error: SOURCE_NOT_FOUND
```

Fix:

```bash
# Verify file exists
ls -la your-file.xes

# Check path in config
cat config.toml | grep -A3 "\[source\]"

# Update path if needed
sed -i 's|path = ".*"|path = "correct/path.xes"|' config.toml
```

### EXECUTION_ERROR (Exit 3)

#### Algorithm Timeout

```
Error: ALGORITHM_TIMEOUT
```

Fix:

```toml
[discovery]
# Increase timeout
timeout_ms = 600000    # 10 minutes instead of 30 seconds

# Or use faster algorithm
algorithm = "dfg"      # Instead of "genetic"
profile = "fast"       # Instead of "quality"
```

#### Out of Memory

```
Error: WASM_MEMORY_EXCEEDED
```

Fix:

```toml
[discovery]
# Use faster algorithm
profile = "fast"

# Or process in chunks
streaming = true
chunk_size = 500

# Or filter input
[source.filters]
min_frequency = 2
```

### PARTIAL_SUCCESS (Exit 4)

Some outputs succeeded, others failed:

```bash
# Check receipt
cat output/receipt.json | jq '.output_status'

# Check which sinks failed
cat output/receipt.json | jq '.sink_results'
```

### SYSTEM_ERROR (Exit 5)

WASM initialization or infrastructure error:

```bash
# Check WASM environment
node -e "console.log(process.versions)"

# Verify module loads
npm test

# Check OTEL configuration
pmctl explain --config config.toml | grep otel
```

## Recovery Strategies

### Retry with Backoff

```bash
#!/bin/bash

attempt=1
max_attempts=3
delay=2

while [ $attempt -le $max_attempts ]; do
  pmctl run --config config.toml && break
  
  exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "Attempt $attempt failed (exit $exit_code)"
    if [ $attempt -lt $max_attempts ]; then
      echo "Retrying in ${delay}s..."
      sleep $delay
      delay=$((delay * 2))  # Exponential backoff
    fi
  fi
  
  attempt=$((attempt + 1))
done
```

### Resume from Checkpoint

```bash
# If interrupted, resume from checkpoint
pmctl watch --config config.toml

# Automatically resumes from last checkpoint
# No reprocessing of previous events
```

### Fallback Algorithm

```bash
#!/bin/bash

try_algorithm() {
  local algo=$1
  sed -i "s/algorithm = .*/algorithm = \"$algo\"/" config.toml
  pmctl run --config config.toml
  return $?
}

# Try in order of preference
try_algorithm "genetic" || \
try_algorithm "heuristic" || \
try_algorithm "dfg"
```

## Debug Mode

```bash
WASM4PM_DEBUG=1 pmctl run --config config.toml
```

Shows:
- Config resolution
- File access
- Memory usage
- Algorithm execution

## Check Logs

```bash
# View recent logs
tail -f output/execution.log

# Filter by level
grep ERROR output/execution.log

# Search for specific error
grep "ALGORITHM_TIMEOUT" output/execution.log
```

## See Also

- [Reference: Error Codes](../reference/error-codes.md)
- [How-To: Debug Config](./debug-config.md)
