/**
 * browser-client.ts
 * WebSocket client example for browser environments
 * Demonstrates consuming the /watch endpoint with native WebSocket API
 */
/**
 * Browser-based WebSocket client for watch mode
 */
export class BrowserWatchClient {
    constructor(url = `ws://${window.location.host}/watch`) {
        this.socket = null;
        this.isConnected = false;
        this.eventHandlers = new Map();
        this.lastHeartbeat = Date.now();
        this.stallCheckInterval = null;
        this.reconnectAttempt = 0;
        this.maxReconnectAttempts = 10;
        this.url = url;
        this.initializeEventHandlers();
    }
    /**
     * Initialize event handler collections
     */
    initializeEventHandlers() {
        const eventTypes = ['heartbeat', 'progress', 'checkpoint', 'error', 'complete', 'reconnect'];
        eventTypes.forEach((type) => {
            this.eventHandlers.set(type, new Set());
        });
    }
    /**
     * Connect to the watch endpoint
     */
    async connect() {
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
                    });
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
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Handle incoming message
     */
    handleMessage(data) {
        try {
            const event = JSON.parse(data);
            // Update heartbeat for stall detection
            if (event.type === 'heartbeat') {
                this.lastHeartbeat = Date.now();
            }
            this.emit(event.type, event);
        }
        catch (error) {
            console.error('[WATCH] Failed to parse event:', error);
        }
    }
    /**
     * Setup timeout detection for stalled connections
     */
    setupStallDetection() {
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
    async handleStall() {
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
            });
            await new Promise((resolve) => setTimeout(resolve, backoff));
            try {
                await this.connect();
            }
            catch (error) {
                console.error('[WATCH] Reconnection failed:', error);
            }
        }
    }
    /**
     * Register event listener
     */
    on(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.add(handler);
        }
    }
    /**
     * Unregister event listener
     */
    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    /**
     * Emit event to all registered listeners
     */
    emit(eventType, event) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(event);
                }
                catch (error) {
                    console.error(`[WATCH] Error in ${eventType} handler:`, error);
                }
            });
        }
    }
    /**
     * Save checkpoint to local storage
     */
    saveCheckpoint(event) {
        const checkpoint = {
            timestamp: new Date().toISOString(),
            hash: event.progress_hash,
        };
        try {
            localStorage.setItem('wasm4pm_checkpoint', JSON.stringify(checkpoint));
            console.log(`[WATCH] Checkpoint saved: ${event.progress_hash}`);
        }
        catch (error) {
            console.warn('[WATCH] Failed to save checkpoint:', error);
        }
    }
    /**
     * Get last checkpoint from local storage
     */
    getLastCheckpoint() {
        try {
            const data = localStorage.getItem('wasm4pm_checkpoint');
            if (data) {
                const checkpoint = JSON.parse(data);
                return checkpoint.hash;
            }
        }
        catch (error) {
            console.warn('[WATCH] Failed to read checkpoint:', error);
        }
        return null;
    }
    /**
     * Clear checkpoint
     */
    clearCheckpoint() {
        try {
            localStorage.removeItem('wasm4pm_checkpoint');
            console.log('[WATCH] Checkpoint cleared');
        }
        catch (error) {
            console.warn('[WATCH] Failed to clear checkpoint:', error);
        }
    }
    /**
     * Close the connection
     */
    close() {
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
    getStatus() {
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
export function createProgressBar(containerId) {
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
        update: (event) => {
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
export function createEventLogger(containerId, maxLines = 100) {
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`Container ${containerId} not found`);
    }
    const logLines = [];
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
    function updateDisplay() {
        logContainer.textContent = logLines.slice(-maxLines).join('\n');
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    return {
        log: (event) => {
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
//# sourceMappingURL=browser-client.js.map