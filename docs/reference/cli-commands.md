# Reference: pmctl CLI Commands

**Version**: 26.4.5  
**Platform**: Linux, macOS, Windows  

## pmctl init

Initialize configuration

```bash
pmctl init [OPTIONS]
```

Options:
- `--sample` - Create sample event log
- `--validate <FILE>` - Validate config file
- `--help` - Show help

## pmctl run

Run process discovery

```bash
pmctl run --config <FILE> [OPTIONS]
```

Options:
- `--config <FILE>` - Configuration file (required)
- `--profile <PROFILE>` - Override profile: fast|balanced|quality|stream
- `--format <FORMAT>` - Output format: human|json|streaming
- `--verbose` - Enable verbose logging
- `--dry-run` - Validate without executing
- `--timeout <MS>` - Override timeout in milliseconds

Exit codes:
- `0` - Success
- `1` - CONFIG_ERROR
- `2` - SOURCE_ERROR
- `3` - EXECUTION_ERROR
- `4` - PARTIAL_SUCCESS
- `5` - SYSTEM_ERROR

## pmctl watch

Monitor file changes

```bash
pmctl watch --config <FILE> [OPTIONS]
```

Options:
- `--config <FILE>` - Configuration file
- `--verbose` - Detailed output
- `--format <FORMAT>` - Output format

## pmctl explain

Show execution plan

```bash
pmctl explain --config <FILE> [OPTIONS]
```

Options:
- `--config <FILE>` - Configuration file
- `--mode <MODE>` - brief|detailed|verbose
- `--expand-env` - Show resolved env vars
- `--show-provenance` - Show config sources

## wasm4pm-service

Start HTTP service

```bash
wasm4pm-service [OPTIONS]
```

Options:
- `--port <PORT>` - Port (default: 3001)
- `--config <FILE>` - Configuration file
- `--verbose` - Enable logging
- `--cors-origin <ORIGIN>` - CORS allow origin

## Global Options

```bash
pmctl [GLOBAL_OPTIONS] <COMMAND>
```

Global options:
- `--version` - Show version
- `--help` - Show help
- `--config-dir <DIR>` - Config directory

## Environment Variables

- `WASM4PM_CONFIG_FILE` - Default config file
- `WASM4PM_PROFILE` - Default profile
- `WASM4PM_LOG_LEVEL` - Log level
- `WASM4PM_DEBUG` - Enable debug logging

## Examples

```bash
# Simple run
pmctl run --config config.toml

# With profile override
pmctl run --config config.toml --profile quality

# Dry run (validate only)
pmctl run --config config.toml --dry-run

# Watch mode
pmctl watch --config config.toml --verbose

# Explain plan
pmctl explain --config config.toml --mode detailed

# Start service
wasm4pm-service --port 3001

# With environment variable
WASM4PM_PROFILE=fast pmctl run --config config.toml
```

## See Also

- [How-To: Analyze Log](../how-to/analyze-log.md)
- [Reference: Config Schema](./config-schema.md)
