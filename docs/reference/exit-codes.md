# Reference: Exit Codes

## Summary

| Code | Category | Meaning |
|------|----------|---------|
| 0 | Success | Completed successfully |
| 1 | Config | Configuration error |
| 2 | Source | Input/source error |
| 3 | Execution | Algorithm/runtime error |
| 4 | Partial | Some outputs succeeded |
| 5 | System | WASM/infrastructure error |

## Checking Exit Code

```bash
pmctl run --config config.toml
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "Success"
elif [ $EXIT_CODE -eq 1 ]; then
  echo "Config error - fix config.toml"
elif [ $EXIT_CODE -eq 2 ]; then
  echo "Source error - check input file"
elif [ $EXIT_CODE -eq 3 ]; then
  echo "Execution error - check algorithm/timeout"
elif [ $EXIT_CODE -eq 4 ]; then
  echo "Partial success - check receipt for details"
elif [ $EXIT_CODE -eq 5 ]; then
  echo "System error - check environment"
fi
```

## Success (0)

Execution completed successfully:
- Configuration valid
- Event log loaded
- Algorithm executed
- Results written
- Receipt generated

Next: Analyze results in `output/`

## Config Error (1)

Configuration validation failed:
- Schema error
- Missing required field
- Invalid value

Next: Run `pmctl init --validate config.toml`

## Source Error (2)

Input/source error:
- File not found
- Format invalid
- Permission denied

Next: Check file path and permissions

## Execution Error (3)

Algorithm/runtime error:
- Algorithm timeout
- Out of memory
- Algorithm crash

Next: Reduce complexity or increase timeout

## Partial Success (4)

Some sinks succeeded, others failed:
- Some output files written
- Some failed

Next: Check `output/receipt.json` for details

## System Error (5)

WASM or infrastructure error:
- Module initialization failed
- OTEL exporter failed

Next: Check Node.js version and environment

## See Also

- [Reference: Error Codes](./error-codes.md)
- [How-To: Error Recovery](../how-to/error-recovery.md)
