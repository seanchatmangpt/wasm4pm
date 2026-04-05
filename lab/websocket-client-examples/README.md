# WebSocket Client Examples

This directory contains reference implementations for consuming the `/watch` endpoint from different environments.

## Overview

The wasm4pm watch mode provides real-time event streaming via WebSocket:

- **Heartbeat events** - Periodic signals for connection health
- **Progress events** - Updates on processing completion percentage
- **Checkpoint events** - Savepoints for recovery on reconnect
- **Error events** - Issue notifications with recovery hints
- **Complete event** - Final receipt with execution metadata
- **Reconnect events** - Backoff delays for resilience

## Files

### nodejs-client.ts

Full-featured Node.js client using the `ws` library.

**Features:**
- Automatic connection management
- Stall detection with timeout recovery
- Checkpoint persistence to filesystem
- AsyncGenerator pattern for streaming
- Comprehensive event logging

**Installation:**

```bash
npm install ws
```

**Usage:**

```typescript
import { WatchModeClient } from './nodejs-client';

const client = new WatchModeClient('ws://localhost:3000/watch');
await client.connect();

for await (const event of client.listen()) {
  switch (event.type) {
    case 'progress':
      console.log(`Progress: ${event.processed}/${event.total}`);
      break;
    case 'checkpoint':
      await client.saveCheckpoint(event);
      break;
    case 'complete':
      console.log(`Finished: ${event.receipt.runId}`);
      break;
  }
}

await client.close();
```

### browser-client.ts

Browser-compatible client using native WebSocket API.

**Features:**
- Event-based listener pattern
- Automatic stall recovery
- Local Storage checkpointing
- UI helper functions (progress bar, event logger)
- No external dependencies

**Installation:**

No dependencies required - use directly in browser or with bundler:

```bash
import { BrowserWatchClient } from './browser-client';
```

**Usage:**

```typescript
const client = new BrowserWatchClient();
await client.connect();

client.on('progress', (event) => {
  console.log(`${event.processed}/${event.total}`);
});

client.on('checkpoint', (event) => {
  client.saveCheckpoint(event);
});

client.on('complete', (event) => {
  console.log('Finished!', event.receipt.runId);
});

// Clean up when done
client.close();
```

**UI Integration:**

```typescript
const progress = createProgressBar('progress-container');
const logger = createEventLogger('log-container');

client.on('progress', (event) => {
  progress.update(event);
});

client.on('*', (event) => {
  logger.log(event);
});

document.getElementById('progress-container')?.appendChild(progress.render());
document.getElementById('log-container')?.appendChild(logger.render());
```

## Event Types

### HeartbeatEvent

```typescript
{
  type: 'heartbeat',
  timestamp: '2026-04-04T15:30:45.123Z',
  lag_ms: 1050
}
```

Use `lag_ms` to detect connection stalls. If greater than expected interval, the process may be paused or overloaded.

### ProgressEvent

```typescript
{
  type: 'progress',
  processed: 5000,
  total: 100000
}
```

Percentage: `(processed / total) * 100`. Progress is monotonic - never decreases.

### CheckpointEvent

```typescript
{
  type: 'checkpoint',
  progress_hash: 'abc123def456'
}
```

Save this hash to resume processing if connection fails. The endpoint will skip already-processed items.

### ErrorEvent

```typescript
{
  type: 'error',
  error: {
    code: 'PARSE_FAILED',
    message: 'Invalid JSON at line 42',
    recoverable: true,
    timestamp: '2026-04-04T15:30:45.123Z'
  },
  recoverable: true
}
```

If `recoverable: false`, the connection will close and processing cannot continue. Otherwise, reconnect with the last checkpoint.

### CompleteEvent

```typescript
{
  type: 'complete',
  receipt: {
    runId: 'run_1712250645123_abc1',
    engineVersion: '0.5.4',
    configHash: 'sha256abc123...',
    profile: 'FAST',
    pipeline: ['step_discover_dfg', 'step_analyze_stats'],
    timing: {
      total_ms: 45000,
      steps: {
        step_discover_dfg: 30000,
        step_analyze_stats: 15000
      }
    },
    outputs: {
      /* algorithm results */
    },
    receipt: {
      startedAt: '2026-04-04T15:30:00.000Z',
      finishedAt: '2026-04-04T15:30:45.000Z',
      inputDataSize: 1048576,
      sourceFormat: 'XES',
      outputDataSize: 524288
    }
  }
}
```

Store this receipt for audit trail and result verification.

### ReconnectEvent

```typescript
{
  type: 'reconnect',
  attempt: 2,
  backoff_ms: 200
}
```

The client will wait `backoff_ms` before reconnecting. Backoff increases exponentially: `backoff * 2.5` per attempt, capped at 5000ms.

## Patterns

### Pattern 1: Simple Streaming

```typescript
// Node.js
const client = new WatchModeClient();
await client.connect();

for await (const event of client.listen()) {
  if (event.type === 'progress') {
    console.log(`${event.processed}/${event.total}`);
  }
}
```

### Pattern 2: Event Hooks (Browser)

```typescript
const client = new BrowserWatchClient();
await client.connect();

const progressElement = document.querySelector('#progress');
let maxProcessed = 0;

client.on('progress', (event) => {
  maxProcessed = Math.max(maxProcessed, event.processed);
  progressElement.textContent = `${maxProcessed}/${event.total}`;
});

client.on('error', (event) => {
  if (!event.recoverable) {
    alert(`Fatal error: ${event.error.message}`);
  }
});

client.on('complete', (event) => {
  console.log('Success!', event.receipt.runId);
});
```

### Pattern 3: Checkpoint Resume

```typescript
const client = new WatchModeClient();
const lastCheckpoint = client.getLastCheckpoint();

// Pass checkpoint to server (implementation varies)
if (lastCheckpoint) {
  console.log(`Resuming from checkpoint: ${lastCheckpoint}`);
  // Send resume request with checkpoint
}

await client.connect();

for await (const event of client.listen()) {
  if (event.type === 'checkpoint') {
    await client.saveCheckpoint(event);
  }
  if (event.type === 'complete') {
    break; // Done
  }
}
```

### Pattern 4: Stall Detection

```typescript
const client = new BrowserWatchClient();
await client.connect();

const healthCheck = setInterval(() => {
  const status = client.getStatus();
  const stallMs = status.stallDuration;

  if (stallMs > 10000) {
    console.warn(`Connection stalled for ${stallMs}ms`);
    // Optionally close and reconnect
    client.close();
  }
}, 5000);

// Cleanup
setTimeout(() => clearInterval(healthCheck), 60000);
```

### Pattern 5: Progress UI (React)

```typescript
import { useEffect, useState } from 'react';
import { BrowserWatchClient } from './browser-client';

export function ProgressMonitor() {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Connecting...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new BrowserWatchClient();

    (async () => {
      try {
        await client.connect();
        setMessage('Processing...');

        client.on('progress', (event) => {
          const pct = Math.round((event.processed / event.total) * 100);
          setProgress(pct);
        });

        client.on('error', (event) => {
          if (!event.recoverable) {
            setError(`Error: ${event.error.message}`);
          }
        });

        client.on('complete', (event) => {
          setMessage(`Complete! Run: ${event.receipt.runId}`);
          setProgress(100);
        });
      } catch (err) {
        setError(`Connection failed: ${err}`);
      }
    })();

    return () => client.close();
  }, []);

  return (
    <div>
      <h2>{message}</h2>
      <progress value={progress} max={100} />
      <p>{progress}%</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

## Testing

### Test Node.js Client

```bash
# Install dependencies
npm install ws @types/ws

# Run tests
npm test -- lab/tests/websocket.test.ts
```

### Test Browser Client

Use the browser DevTools console:

```javascript
const client = new BrowserWatchClient('ws://localhost:3000/watch');

client.on('progress', (e) => {
  console.log(`Progress: ${e.processed}/${e.total}`);
});

client.on('complete', (e) => {
  console.log('Done!', e.receipt.runId);
});

await client.connect();
```

## Troubleshooting

### "Connection refused"

- Ensure the server is running and `/watch` endpoint is available
- Check WebSocket URL: `ws://localhost:3000` (not `http://`)
- Verify CORS/proxy configuration if cross-origin

### "Connection stalled - no events for Xms"

- Network latency or process pause
- Check server logs for slow operations
- Client will automatically reconnect with backoff

### "Checkpoint integrity check failed"

- Checkpoint file was corrupted or modified
- Delete checkpoint file and restart: `rm .wasm4pm/checkpoint`
- Client will resume from beginning

### "Max reconnect attempts exceeded"

- Server appears unreachable
- Check server status and logs
- Consider exponential backoff strategy in your app

## Performance Notes

- **Heartbeat interval:** 1000ms (configurable)
- **Event threshold:** 10 events trigger heartbeat (prevents timeout perception)
- **Checkpoint interval:** 5000ms (prevents excessive disk I/O)
- **Backoff cap:** 5000ms (prevents excessive delays)

For high-throughput scenarios:
- Increase heartbeat interval to 5000ms
- Increase checkpoint interval to 30000ms
- Use Web Workers (browser) or Worker Threads (Node.js) for parallel processing

## References

- [WebSocket API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [ws package (npm)](https://www.npmjs.com/package/ws)
- [wasm4pm Watch Mode Docs](../../wasm4pm/src/WATCH_MODE.md)
- [wasm4pm API Reference](../../wasm4pm/API.md)
