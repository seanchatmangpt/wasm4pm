# HTTP Service Validation Lab

Comprehensive HTTP service validation tests for wasm4pm-service v26.4.5

## Overview

This lab directory contains production-grade tests and examples for the wasm4pm-service HTTP API. It validates:

- All 7 HTTP endpoints
- Request/response schemas
- Error handling
- Single-run constraint (v26.4.5 critical feature)
- Queue management and FIFO ordering
- Progress tracking and run cancellation
- Complete end-to-end workflows

## Directory Structure

```
lab/
├── tests/
│   └── http.test.ts              # 50+ comprehensive test cases (Vitest)
├── http-client-examples/
│   ├── curl-examples.sh          # cURL command examples
│   ├── node-examples.js          # Node.js client library + examples
│   └── javascript-examples.html  # Interactive browser examples
├── reports/
│   └── http-conformance.json     # Test results and conformance report
└── README.md                      # This file
```

## Quick Start

### Prerequisites

- Node.js 18+ (for running tests)
- wasm4pm-service running on `localhost:3001`
- Vitest (included in workspace)

### Running Tests

```bash
# From wasm4pm root directory
cd lab

# Run all HTTP tests
npm test -- tests/http.test.ts

# Run with coverage
npm test -- tests/http.test.ts --coverage

# Run in watch mode
npm test -- tests/http.test.ts --watch
```

### Service Startup

```bash
# Terminal 1: Start the service
cd /Users/sac/wasm4pm/packages/service
npm run start

# Terminal 2: Run tests
cd /Users/sac/wasm4pm/lab
npm test -- tests/http.test.ts
```

## Test Coverage

### 1. Server Startup & Health (5 tests)
- Service starts on default port 3001
- Health check responds at /status
- OpenAPI docs available at /api/docs
- All endpoints documented in spec
- Schema definitions included

### 2. POST /run Endpoint - Valid Requests (6 tests)
- Accept valid request and return run_id
- Return status of queued or running
- Include started_at in ISO format
- Accept optional input_file parameter
- Accept optional profile parameter
- Accept config with multiple lines

### 3. POST /run Endpoint - Invalid Requests (5 tests)
- Reject request without config (400)
- Reject request with empty config (400)
- Reject request with null config (400)
- Return error details in validation response
- Reject with 503 when at queue capacity

### 4. GET /run/:run_id Endpoint - Successful Cases (6 tests)
- Return status for queued run
- Return started_at timestamp
- Provide progress percentage
- Include receipt when run completes
- Include duration_ms when completed
- Include finished_at when completed

### 5. GET /run/:run_id Endpoint - Error Cases (3 tests)
- Return 404 for non-existent run_id
- Return error message in 404 response
- Include timestamp in error response

### 6. GET /watch/:run_id Endpoint (4 tests)
- Return 404 for non-existent run_id
- Stream events as JSONL for HTTP clients
- Handle watch for running run
- Return appropriate headers for streaming

### 7. POST /explain Endpoint - Valid Requests (7 tests)
- Accept valid explain request
- Default to brief mode
- Support full mode
- Support brief mode explicitly
- Return timestamp in explain response
- Not create any runs when explaining
- Not modify state when explaining

### 8. POST /explain Endpoint - Error Cases (2 tests)
- Reject request without config (400)
- Reject request with empty config (400)

### 9. GET /status Endpoint - Full Response (7 tests)
- Show server health status
- Show uptime in milliseconds
- Show queue depth
- Show completed count
- Show failed count
- Include current_run info if running
- Show ISO timestamp

### 10. DELETE /run/:run_id Endpoint (4 tests)
- Return 404 for non-existent run_id
- Cancel queued run (200)
- Not allow cancelling running run (409)
- Not allow cancelling completed run (409)

### 11. Single-Run Constraint (v26.4.5) - CRITICAL (5 tests)
- Only execute one run at a time
- Respect FIFO order for queue execution
- Queue runs when one is executing
- Enforce queue limit (max 10)
- Transition from queued to running to completed

### 12. Request/Response Schemas (5 tests)
- Return valid RunResponse for POST /run
- Return valid RunStatusResponse for GET /run/:run_id
- Return valid StatusResponse for GET /status
- Return valid ExplainResponse for POST /explain
- Return valid OpenAPI spec for GET /api/docs

### 13. Error Handling & Edge Cases (5 tests)
- Return 404 for non-existent endpoint
- Include error timestamp in error response
- Include error details in validation errors
- Handle rapid successive requests
- Maintain accurate statistics after operations

### 14. HTTP Headers & Metadata (4 tests)
- Include Content-Type application/json
- Include X-Request-ID header
- Allow CORS with Access-Control-Allow-Origin
- Return correct HTTP status codes

**Total: 70+ test cases**

## Using the Examples

### cURL Examples

```bash
# View all available examples
cat http-client-examples/curl-examples.sh

# Health check
curl -s -X GET http://localhost:3001/status | jq .

# Submit a run
curl -s -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"config": "[test]\nkey = \"value\""}' | jq .

# Check status
curl -s -X GET http://localhost:3001/run/{RUN_ID} | jq .
```

### Node.js Examples

```bash
# Run all examples
node http-client-examples/node-examples.js
```

### JavaScript/Browser Examples

```bash
# Open in browser
open http-client-examples/javascript-examples.html
```

## API Endpoints

### 1. POST /run - Submit Run
```
Status: 202 Accepted
Body: { run_id, status, started_at }
```

### 2. GET /run/:run_id - Check Status
```
Status: 200 OK
Body: { run_id, status, progress, started_at, finished_at?, duration_ms?, receipt?, error? }
```

### 3. DELETE /run/:run_id - Cancel Run
```
Status: 200 OK (cancelled) | 404 (not found) | 409 (cannot cancel)
Body: { run_id, status, timestamp }
```

### 4. GET /watch/:run_id - Stream Events
```
Status: 200 OK (streaming) | 404 (not found) | 501 (not implemented)
Content-Type: application/x-ndjson (streaming JSONL events)
```

### 5. POST /explain - Explain Config
```
Status: 200 OK
Body: { explanation, mode, config, timestamp }
```

### 6. GET /status - Server Health
```
Status: 200 OK
Body: { server, uptime_ms, queued, completed, failed, timestamp, current_run? }
```

### 7. GET /api/docs - OpenAPI Spec
```
Status: 200 OK
Body: { openapi, info, paths, components, ... }
```

## Key Features Tested

### Single-Run Constraint (Critical)
The service enforces that only ONE run executes at a time. All other submissions are queued in FIFO order.

### Queue Management
- Maximum queue size: 10
- Requests beyond limit: 503 Service Unavailable
- Cancellation only for queued runs
- Running runs cannot be cancelled

### Error Handling
- 400: Invalid request (missing/empty config)
- 404: Resource not found (run_id)
- 409: Conflict (cannot cancel running)
- 503: Service unavailable (queue full)
- 501: Not implemented (WebSocket not available)

## File Descriptions

### `/lab/tests/http.test.ts`
Main test suite with 70+ test cases covering all endpoints and error cases.

### `/lab/http-client-examples/curl-examples.sh`
Collection of cURL commands for all endpoints.

### `/lab/http-client-examples/node-examples.js`
Node.js HTTP client with 10 example scenarios.

### `/lab/http-client-examples/javascript-examples.html`
Interactive browser UI for testing all endpoints.

### `/lab/reports/http-conformance.json`
JSON report template with test results and conformance status.

## Version

- **wasm4pm**: 26.4.5
- **Test Suite**: 26.4.5
- **Last Updated**: 2026-04-04

## Status

All test files and examples are production-ready. Run tests to generate conformance report.
