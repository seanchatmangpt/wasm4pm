/**
 * browser-client.ts
 * WebSocket client example for browser environments
 * Demonstrates consuming the /watch endpoint with native WebSocket API
 */

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
 * Browser-based WebSocket client for watch mode
 */
export class BrowserWatchClient {
  private url: string;
  private socket: WebSocket | null = null;
  private isConnected: boolean = false;
  private eventHandlers: Map<string, Set<(event: WatchEvent) => void>> = new Map();
  private lastHeartbeat: number = Date.now();
  private stallCheckInterval: number | null = null;
  private reconnectAttempt: number = 0;
  private maxReconnectAttempts: number = 10;

  constructor(url: string = `ws://${window.location.host}/watch`) {
    this.url = url;
    this.initializeEventHandlers();
  }

  /**
   * Initialize event handler collections
   */
  private initializeEventHandlers(): void {
    const eventTypes = ['heartbeat', 'progress', 'checkpoint', 'error', 'complete', 'reconnect'];
    eventTypes.forEach((type) => {
      this.eventHandlers.set(type, new Set());
    });
  }

  /**
   * Connect to the watch endpoint
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.addEventListener('open', () => {
          console.log('[WATCH] Connected to watch endpoint');
          this.isConnected = true;
          this.reconnectAttempt = 0;
          this.setupStallDetection();
          resolve();
        });

        this.socket.addEventListener('message', (evt) => {
          this.handleMessage(evt.data);
        });

        this.socket.addEventListener('error', (error) => {
          console.error('[WATCH] WebSocket error:', error);
          this.emit('error', {
            type: 'error',
            error: {
              code: 'WEBSOCKET_ERROR',
              message: 'WebSocket connection error',
              recoverable: true,
              timestamp: new Date().toISOString(),
            },
            recoverable: true,
          } as ErrorEvent);
          reject(error);
        });

        this.socket.addEventListener('close', () => {
          console.log('[WATCH] Connection closed');
          this.isConnected = false;
          if (this.stallCheckInterval !== null) {
            clearInterval(this.stallCheckInterval);
            this.stallCheckInterval = null;
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const event: WatchEvent = JSON.parse(data);

      // Update heartbeat for stall detection
      if (event.type === 'heartbeat') {
        this.lastHeartbeat = Date.now();
      }

      this.emit(event.type, event);
    } catch (error) {
      console.error('[WATCH] Failed to parse event:', error);
    }
  }

  /**
   * Setup timeout detection for stalled connections
   */
  private setupStallDetection(): void {
    if (this.stallCheckInterval !== null) {
      clearInterval(this.stallCheckInterval);
    }

    this.stallCheckInterval = window.setInterval(() => {
      const stallDuration = Date.now() - this.lastHeartbeat;
      if (stallDuration > 10000) {
        console.warn(`[WATCH] No events for ${stallDuration}ms - connection may be stalled`);
        this.handleStall();
      }
    }, 5000);
  }

  /**
   * Handle stalled connection
   */
  private async handleStall(): Promise<void> {
    if (this.isConnected && this.socket) {
      console.log('[WATCH] Attempting to recover stalled connection');

      this.reconnectAttempt++;
      if (this.reconnectAttempt > this.maxReconnectAttempts) {
        console.error('[WATCH] Max reconnect attempts exceeded');
        this.socket.close();
        return;
      }

      const backoff = Math.min(100 * Math.pow(2, this.reconnectAttempt), 5000);

      this.emit('reconnect', {
        type: 'reconnect',
        attempt: this.reconnectAttempt,
        backoff_ms: backoff,
      } as ReconnectEvent);

      await new Promise((resolve) => setTimeout(resolve, backoff));

      try {
        await this.connect();
      } catch (error) {
        console.error('[WATCH] Reconnection failed:', error);
      }
    }
  }

  /**
   * Register event listener
   */
  on(eventType: string, handler: (event: WatchEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.add(handler);
    }
  }

  /**
   * Unregister event listener
   */
  off(eventType: string, handler: (event: WatchEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event to all registered listeners
   */
  private emit(eventType: string, event: WatchEvent): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[WATCH] Error in ${eventType} handler:`, error);
        }
      });
    }
  }

  /**
   * Save checkpoint to local storage
   */
  saveCheckpoint(event: CheckpointEvent): void {
    const checkpoint = {
      timestamp: new Date().toISOString(),
      hash: event.progress_hash,
    };
    try {
      localStorage.setItem('wasm4pm_checkpoint', JSON.stringify(checkpoint));
      console.log(`[WATCH] Checkpoint saved: ${event.progress_hash}`);
    } catch (error) {
      console.warn('[WATCH] Failed to save checkpoint:', error);
    }
  }

  /**
   * Get last checkpoint from local storage
   */
  getLastCheckpoint(): string | null {
    try {
      const data = localStorage.getItem('wasm4pm_checkpoint');
      if (data) {
        const checkpoint = JSON.parse(data);
        return checkpoint.hash;
      }
    } catch (error) {
      console.warn('[WATCH] Failed to read checkpoint:', error);
    }
    return null;
  }

  /**
   * Clear checkpoint
   */
  clearCheckpoint(): void {
    try {
      localStorage.removeItem('wasm4pm_checkpoint');
      console.log('[WATCH] Checkpoint cleared');
    } catch (error) {
      console.warn('[WATCH] Failed to clear checkpoint:', error);
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.socket) {
      this.socket.close(1000, 'Client closing');
    }
    if (this.stallCheckInterval !== null) {
      clearInterval(this.stallCheckInterval);
      this.stallCheckInterval = null;
    }
  }

  /**
   * Get connection status
   */
  getStatus(): {
    isConnected: boolean;
    lastHeartbeat: number;
    stallDuration: number;
  } {
    return {
      isConnected: this.isConnected,
      lastHeartbeat: this.lastHeartbeat,
      stallDuration: Date.now() - this.lastHeartbeat,
    };
  }
}

/**
 * UI Helper: Progress Bar
 */
export function createProgressBar(containerId: string): {
  update: (event: ProgressEvent) => void;
  render: () => HTMLElement;
} {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container ${containerId} not found`);
  }

  let current = 0;
  let total = 100;

  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    width: 100%;
    height: 24px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    margin: 16px 0;
  `;

  const fillBar = document.createElement('div');
  fillBar.style.cssText = `
    height: 100%;
    background: #4CAF50;
    transition: width 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 12px;
  `;

  progressBar.appendChild(fillBar);

  return {
    update: (event: ProgressEvent) => {
      current = event.processed;
      total = event.total;
      const percentage = total > 0 ? (current / total) * 100 : 0;
      fillBar.style.width = `${percentage}%`;
      fillBar.textContent = `${percentage.toFixed(0)}%`;
    },
    render: () => progressBar,
  };
}

/**
 * UI Helper: Event Logger
 */
export function createEventLogger(containerId: string, maxLines: number = 100): {
  log: (event: WatchEvent) => void;
  render: () => HTMLElement;
  clear: () => void;
} {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container ${containerId} not found`);
  }

  const logLines: string[] = [];
  const logContainer = document.createElement('div');
  logContainer.style.cssText = `
    font-family: monospace;
    font-size: 12px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    height: 400px;
    overflow-y: auto;
  `;

  function updateDisplay(): void {
    logContainer.textContent = logLines.slice(-maxLines).join('\n');
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  return {
    log: (event: WatchEvent) => {
      const timestamp = new Date().toLocaleTimeString();
      const line = `[${timestamp}] ${JSON.stringify(event)}`;
      logLines.push(line);
      updateDisplay();
    },
    render: () => logContainer,
    clear: () => {
      logLines.length = 0;
      updateDisplay();
    },
  };
}

export { WatchEvent };
