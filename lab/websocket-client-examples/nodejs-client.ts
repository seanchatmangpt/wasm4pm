/**
 * nodejs-client.ts
 * WebSocket client example for Node.js environments
 * Demonstrates how to consume the /watch endpoint from Node.js
 */

import * as ws from 'ws';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Event types from the watch endpoint
 */
interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
  lag_ms: number;
}

interface ProgressEvent {
  type: 'progress';
  processed: number;
  total: number;
}

interface CheckpointEvent {
  type: 'checkpoint';
  progress_hash: string;
}

interface ErrorEvent {
  type: 'error';
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    timestamp: string;
  };
  recoverable: boolean;
}

interface CompleteEvent {
  type: 'complete';
  receipt: {
    runId: string;
    engineVersion: string;
    configHash: string;
    profile: string;
    pipeline: string[];
    timing: {
      total_ms: number;
      steps: Record<string, number>;
    };
    outputs: Record<string, unknown>;
    receipt: {
      startedAt: string;
      finishedAt: string;
      inputDataSize?: number;
      outputDataSize?: number;
      sourceFormat?: string;
    };
  };
}

interface ReconnectEvent {
  type: 'reconnect';
  attempt: number;
  backoff_ms: number;
}

type WatchEvent = HeartbeatEvent | ProgressEvent | CheckpointEvent | ErrorEvent | CompleteEvent | ReconnectEvent;

/**
 * WebSocket client for consuming watch mode events
 */
export class WatchModeClient {
  private url: string;
  private socket: ws.WebSocket | null = null;
  private checkpointPath: string;
  private isConnected: boolean = false;
  private lastHeartbeat: number = Date.now();
  private stallTimeout: NodeJS.Timeout | null = null;

  constructor(url: string = 'ws://localhost:3000/watch', checkpointPath?: string) {
    this.url = url;
    this.checkpointPath = checkpointPath || path.join(process.cwd(), '.wasm4pm/checkpoint');
  }

  /**
   * Connect to the watch endpoint
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new ws.WebSocket(this.url);

        this.socket.on('open', () => {
          console.log(`[WATCH] Connected to ${this.url}`);
          this.isConnected = true;
          this.setupStallDetection();
          resolve();
        });

        this.socket.on('error', (error) => {
          console.error('[WATCH] WebSocket error:', error);
          reject(error);
        });

        this.socket.on('close', () => {
          console.log('[WATCH] Connection closed');
          this.isConnected = false;
          if (this.stallTimeout) {
            clearTimeout(this.stallTimeout);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Listen to watch events
   */
  async *listen(): AsyncGenerator<WatchEvent> {
    if (!this.socket) {
      throw new Error('Not connected. Call connect() first.');
    }

    const eventQueue: WatchEvent[] = [];
    let resolveWait: (() => void) | null = null;

    return new Promise<void>((resolve) => {
      this.socket!.on('message', (data: string) => {
        try {
          const event: WatchEvent = JSON.parse(data);
          eventQueue.push(event);

          // Update heartbeat for stall detection
          if (event.type === 'heartbeat') {
            this.lastHeartbeat = Date.now();
            this.setupStallDetection();
          }

          if (resolveWait) {
            resolveWait();
            resolveWait = null;
          }
        } catch (error) {
          console.error('[WATCH] Failed to parse event:', error);
        }
      });

      this.socket!.on('close', () => {
        resolve();
      });
    }).then(async () => {
      // Yield remaining events
      while (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      }
    });

    // This is a generator pattern - never completes until socket closes
    while (this.isConnected) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
          // Timeout to prevent hanging
          setTimeout(() => {
            if (resolveWait) {
              resolveWait();
              resolveWait = null;
            }
          }, 100);
        });
      }
    }

    // Final yield of remaining events
    while (eventQueue.length > 0) {
      yield eventQueue.shift()!;
    }
  }

  /**
   * Setup timeout detection for stalled connections
   */
  private setupStallDetection(): void {
    if (this.stallTimeout) {
      clearTimeout(this.stallTimeout);
    }

    this.stallTimeout = setTimeout(() => {
      const stallDuration = Date.now() - this.lastHeartbeat;
      if (stallDuration > 5000) {
        console.warn(`[WATCH] No events for ${stallDuration}ms - connection may be stalled`);
      }
    }, 5000);
  }

  /**
   * Save checkpoint for recovery
   */
  async saveCheckpoint(event: CheckpointEvent): Promise<void> {
    const dir = path.dirname(this.checkpointPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const checkpoint = {
      timestamp: new Date().toISOString(),
      hash: event.progress_hash,
    };

    fs.writeFileSync(this.checkpointPath, JSON.stringify(checkpoint, null, 2));
    console.log(`[WATCH] Checkpoint saved: ${event.progress_hash}`);
  }

  /**
   * Get last checkpoint if available
   */
  getLastCheckpoint(): string | null {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        const data = JSON.parse(fs.readFileSync(this.checkpointPath, 'utf-8'));
        return data.hash;
      }
    } catch (error) {
      console.warn('[WATCH] Failed to read checkpoint:', error);
    }
    return null;
  }

  /**
   * Close the connection gracefully
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.close(1000, 'Client closing');
        setTimeout(resolve, 100);
      } else {
        resolve();
      }
    });
  }
}

/**
 * Example usage
 */
async function main() {
  const client = new WatchModeClient('ws://localhost:3000/watch');

  try {
    await client.connect();
    console.log('[DEMO] Connected to watch endpoint');

    const startTime = Date.now();
    const checkpointHash = client.getLastCheckpoint();

    if (checkpointHash) {
      console.log(`[DEMO] Resuming from checkpoint: ${checkpointHash}`);
    }

    for await (const event of client.listen()) {
      const elapsed = Date.now() - startTime;

      switch (event.type) {
        case 'heartbeat': {
          const hb = event as HeartbeatEvent;
          console.log(`[${elapsed}ms] Heartbeat: ${hb.timestamp}, lag: ${hb.lag_ms}ms`);
          break;
        }

        case 'progress': {
          const prog = event as ProgressEvent;
          const pct = ((prog.processed / prog.total) * 100).toFixed(1);
          console.log(`[${elapsed}ms] Progress: ${prog.processed}/${prog.total} (${pct}%)`);
          break;
        }

        case 'checkpoint': {
          const cp = event as CheckpointEvent;
          await client.saveCheckpoint(cp);
          break;
        }

        case 'error': {
          const err = event as ErrorEvent;
          console.error(
            `[${elapsed}ms] Error: ${err.error.code} - ${err.error.message}`,
            `(recoverable: ${err.recoverable})`
          );
          if (!err.recoverable) {
            throw new Error(`Unrecoverable error: ${err.error.message}`);
          }
          break;
        }

        case 'complete': {
          const comp = event as CompleteEvent;
          console.log(`[${elapsed}ms] Complete! Run ID: ${comp.receipt.runId}`);
          console.log(`  Engine: ${comp.receipt.engineVersion}`);
          console.log(`  Pipeline: ${comp.receipt.pipeline.join(' -> ')}`);
          console.log(`  Timing: ${comp.receipt.timing.total_ms}ms`);
          break;
        }

        case 'reconnect': {
          const rc = event as ReconnectEvent;
          console.log(`[${elapsed}ms] Reconnecting... attempt ${rc.attempt}, backoff ${rc.backoff_ms}ms`);
          break;
        }
      }
    }

    console.log('[DEMO] Watch stream ended');
  } catch (error) {
    console.error('[DEMO] Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

export { WatchModeClient, WatchEvent };
