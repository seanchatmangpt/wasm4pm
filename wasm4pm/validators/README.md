# @wasm4pm/validators

Comprehensive validation suite for @wasm4pm/wasm4pm v26.4.5.

## Overview

Six independent JavaScript/MJS validators that test different execution surfaces:

| Validator | Tests | Use Case |
|-----------|-------|----------|
| **CLI** | 5 | pmctl command-line interface validation |
| **HTTP** | 9 | REST API endpoints and status codes |
| **WebSocket** | 4 | Real-time streaming and connections |
| **Observability** | 8 | Logging, tracing, and monitoring |
| **I/O** | 14 | Import/export formats (XES, JSON, OCEL) |
| **Performance** | 16 | Latency, scalability, memory bounds |
| **All** | 56 | Unified report across all surfaces |

## Installation

```bash
npm install @wasm4pm/validators
```

## Usage

### Run All Validators

```bash
npx wasm4pm-validate
# or
node validators/index.mjs
```

### Run Individual Validators

```bash
# CLI validation
npx wasm4pm-validate-cli
node validators/cli.mjs

# HTTP API (requires service running)
npx wasm4pm-validate-http http://localhost:3000
node validators/http.mjs

# WebSocket (requires service running)
npx wasm4pm-validate-ws ws://localhost:3000
node validators/websocket.mjs

# Observability
npx wasm4pm-validate-observability
node validators/observability.mjs

# I/O Format Support
npx wasm4pm-validate-io
node validators/io.mjs

# Performance Characteristics
npx wasm4pm-validate-performance
node validators/performance.mjs
```

### Generate Reports

```bash
# JSON report
node validators/index.mjs --output report.json

# Custom HTTP endpoint
node validators/index.mjs --http http://custom-host:3000 --output report.json

# Custom WebSocket endpoint
node validators/index.mjs --ws ws://custom-host:3000 --output report.json
```

## As a Module

```javascript
import { runAllValidators } from '@wasm4pm/validators';

const results = await runAllValidators({
  httpBaseUrl: 'http://localhost:3000',
  wsBaseUrl: 'ws://localhost:3000',
  outputFile: 'validation-report.json',
});

console.log(`Passed: ${results.summary.passed}/${results.summary.total}`);
```

```javascript
// Individual validators
import { validateCLI } from '@wasm4pm/validators/cli';
import { validateHTTP } from '@wasm4pm/validators/http';
import { validateIO } from '@wasm4pm/validators/io';

const cli = await validateCLI();
const http = await validateHTTP('http://localhost:3000');
const io = await validateIO();
```

## Test Coverage

### CLI (5 tests)
- ✓ Help command
- ✓ Version reporting
- ✓ Algorithm listing
- ✓ Algorithm explanation
- ✓ Exit code correctness

### HTTP (9 tests)
- ✓ GET /status
- ✓ GET /api/docs
- ✓ GET /explain/:algorithm
- ✓ POST /run (valid request)
- ✓ POST /run (validation)
- ✓ GET /status/:run_id
- ✓ DELETE /:run_id
- ✓ Queue constraints
- ✓ Response headers

### WebSocket (4 tests)
- ✓ Connection establishment
- ✓ Message sending
- ✓ Clean closure
- ✓ Multiple connections

### Observability (8 tests)
- ✓ Console logging
- ✓ Error logging
- ✓ LOG_LEVEL env var
- ✓ DEBUG env var
- ✓ OTEL environment setup
- ✓ Secret field detection
- ✓ Structured logging
- ✓ Log level filtering

### I/O (14 tests)
- ✓ XES 1.0 support
- ✓ XES 2.0 support
- ✓ JSON array import
- ✓ NDJSON import
- ✓ OCEL support
- ✓ CSV with headers
- ✓ JSON export
- ✓ DOT/GraphViz export
- ✓ Receipt generation
- ✓ Hash verification
- ✓ Determinism
- ✓ Encoding detection
- ✓ Attribute preservation
- ✓ Timestamp parsing

### Performance (16 tests)
- ✓ Small log latency
- ✓ Medium log latency
- ✓ Linear scaling (O(n))
- ✓ Profile: fast
- ✓ Profile: balanced
- ✓ Profile: quality
- ✓ Profile: stream
- ✓ Memory bounds
- ✓ DFG performance
- ✓ Heuristic Miner
- ✓ Inductive Miner
- ✓ Alpha++ performance
- ✓ Stress test (1M+ events)
- ✓ Deep traces
- ✓ Wide logs
- ✓ Worker threads

## Output Format

All validators output JSON conformance reports in this format:

```json
{
  "metadata": {
    "timestamp": "2026-04-05T13:26:28.000Z",
    "surface": "CLI",
    "platform": "darwin",
    "nodeVersion": "v20.x.x"
  },
  "tests": [
    {
      "name": "Test description",
      "pass": true,
      "error": null
    }
  ],
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0
  }
}
```

## Integration with lab/

These validators are called by the `/lab/` post-publication validation system to verify the published npm package conformance.

## Requirements

- **Node.js**: 18+ (16+ minimum)
- **wasm4pm**: Published npm package or local build
- **HTTP Service** (optional): For HTTP/WebSocket tests
- **pmctl CLI** (optional): For CLI tests

## Exit Codes

- `0` — All tests passed
- `1` — One or more tests failed

## Environment Variables

- `DEBUG` — Enable debug output
- `LOG_LEVEL` — Set log level (debug, info, warn, error)
- `OTEL_EXPORTER_OTLP_ENDPOINT` — OTEL collector endpoint
- `OTEL_SERVICE_NAME` — OTEL service name

## FAQ

**Q: HTTP tests fail with "Connection refused"**  
A: Start the HTTP service: `npm run start:service` in another terminal

**Q: WebSocket tests fail**  
A: Ensure the HTTP service is running with WebSocket support enabled

**Q: CLI tests fail with "command not found"**  
A: Install pmctl or link the local version: `npm link @wasm4pm/wasm4pm`

**Q: How do I generate a conformance report?**  
A: Run `node validators/index.mjs --output report.json`

## Files

```
validators/
├── README.md              # This file
├── package.json           # Package manifest
├── index.mjs             # Main orchestrator
├── cli.mjs               # CLI validator
├── http.mjs              # HTTP validator
├── websocket.mjs         # WebSocket validator
├── observability.mjs     # Observability validator
├── io.mjs                # I/O validator
└── performance.mjs       # Performance validator
```

## License

MIT
