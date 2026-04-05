# Reference: Error Codes and Remediation

## Exit Code 0 (SUCCESS)

**Status**: Execution completed successfully

Indicates:
- ✓ Configuration valid
- ✓ Event log loaded
- ✓ Algorithm executed
- ✓ Results written
- ✓ Receipt generated

No action needed.

## Exit Code 1 (CONFIG_ERROR)

**Status**: Configuration invalid

### CONFIG_INVALID
Schema validation failed

```
Remediation:
1. pmctl init --validate config.toml
2. Review error message
3. Fix config field
4. Retry
```

### CONFIG_MISSING
Required field missing

```
Example:
  Missing: [source] section
  
Fix:
  [source]
  type = "file"
  path = "events.xes"
```

## Exit Code 2 (SOURCE_ERROR)

**Status**: Input/source error

### SOURCE_NOT_FOUND
File doesn't exist

```
Fix:
  ls -la $(grep path config.toml | awk '{print $3}')
  # If missing, download or copy file
```

### SOURCE_INVALID
Format unrecognized

```
Fix:
  # Verify file format matches config
  file events.xes
  # Update format in config if needed
```

### SOURCE_PERMISSION
Access denied

```
Fix:
  chmod 644 events.xes
  # Ensure read permission
```

## Exit Code 3 (EXECUTION_ERROR)

**Status**: Algorithm/runtime error

### ALGORITHM_FAILED
Algorithm crashed

```
Fix:
  1. Try different algorithm
  2. Try faster profile
  3. Try smaller input subset
```

### ALGORITHM_TIMEOUT
Exceeded timeout

```
Fix:
  [discovery]
  timeout_ms = 600000  # Increase from 300000
```

### WASM_MEMORY_EXCEEDED
Out of memory

```
Fix:
  # Option 1: Use faster algorithm
  [discovery]
  profile = "fast"
  
  # Option 2: Stream mode
  [source]
  type = "stream"
  
  # Option 3: Smaller input
  # Filter log before processing
```

## Exit Code 4 (PARTIAL_SUCCESS)

**Status**: Some outputs succeeded, others failed

Check receipt:

```bash
jq '.sink_results' output/receipt.json
```

Per-sink failure:
- JSON sink succeeded but HTML failed
- File write failed but metrics succeeded

Fix: Check individual sink status and address.

## Exit Code 5 (SYSTEM_ERROR)

**Status**: WASM or infrastructure error

### WASM_INIT_FAILED
Module initialization failed

```
Fix:
  1. Update Node.js: node --version
  2. Reinstall: npm install -g @wasm4pm/pmctl
  3. Test WASM: node -e "require('wasm4pm')"
```

### OTEL_FAILED
Observability system error (non-fatal)

```
Note: Execution continues, but telemetry not sent

Fix:
  1. Check OTEL endpoint reachable
  2. Verify API key if required
  3. Disable OTEL if not critical:
     [observability.otel]
     enabled = false
```

## Troubleshooting Matrix

| Symptom | Check | Fix |
|---------|-------|-----|
| No output files | permissions | `chmod 755 output/` |
| Slow execution | algorithm | Use `fast` profile |
| Out of memory | input size | Use `stream` mode |
| Config error | schema | `pmctl init --validate` |
| File not found | path | Update `source.path` |

## See Also

- [How-To: Error Recovery](../how-to/error-recovery.md)
- [How-To: Debug Config](../how-to/debug-config.md)
- [Reference: Exit Codes](./exit-codes.md)
