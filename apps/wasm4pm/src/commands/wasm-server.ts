/**
 * wasm-server.ts — CLI commands for managing the long-lived WASM server
 *
 * Commands:
 *   wpm wasm-server start   — Start the WASM server
 *   wpm wasm-server stop    — Stop the running WASM server
 *   wpm wasm-server status  — Check if server is running and show stats
 *   wpm wasm-server reset   — Kill and restart the server
 */

import { defineCommand } from 'citty';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { consola } from 'consola';
import { WasmServer } from '../wasm-server.js';
import { EXIT_CODES } from '../exit-codes.js';

const SOCKET_PATH = path.join(os.homedir(), '.wasm4pm', 'wasm-server.sock');

/**
 * Send a JSON-RPC request to the running WASM server
 */
async function sendRequest(
  method: string,
  params?: Record<string, unknown>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH, () => {
      const request = JSON.stringify({ method, params });
      socket.write(request + '\n');
    });

    let response = '';
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      const lines = response.split('\n');
      if (lines.length > 1) {
        try {
          const result = JSON.parse(lines[0]);
          socket.destroy();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * wpm wasm-server start
 */
export const wasmServerStart = defineCommand({
  meta: {
    name: 'start',
    description: 'Start the long-lived WASM server (reduces CLI latency)',
  },
  args: {
    background: {
      type: 'boolean',
      description: 'Start in background (default: foreground)',
      alias: 'b',
    },
    verbose: {
      type: 'boolean',
      description: 'Show detailed logs',
      alias: 'v',
    },
  },
  async run(ctx) {
    try {
      const server = new WasmServer({
        socketPath: SOCKET_PATH,
        verbose: ctx.args.verbose ?? false,
      });

      await server.start();
      const status = server.getStatus();

      consola.success(`WASM server started`);
      consola.info(`Socket: ${status.socketPath}`);
      consola.info(
        `Status: Ready to accept connections (reduces CLI latency to <500ms)`
      );

      if (!ctx.args.background) {
        consola.log('Press Ctrl+C to stop the server.');
        // Keep process alive
        await new Promise(() => {});
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      consola.error(`Failed to start WASM server: ${message}`);
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * wpm wasm-server stop
 */
export const wasmServerStop = defineCommand({
  meta: {
    name: 'stop',
    description: 'Stop the running WASM server',
  },
  async run() {
    try {
      const result = await sendRequest('shutdown');

      if (result.result) {
        consola.success('WASM server stopped');
        process.exit(EXIT_CODES.success);
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('ECONNREFUSED') ||
          err.message.includes('No such file'))
      ) {
        consola.warn('WASM server is not running');
        process.exit(EXIT_CODES.success);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        consola.error(`Failed to stop WASM server: ${message}`);
        process.exit(EXIT_CODES.execution_error);
      }
    }
  },
});

/**
 * wpm wasm-server status
 */
export const wasmServerStatus = defineCommand({
  meta: {
    name: 'status',
    description: 'Check WASM server status and statistics',
  },
  async run() {
    try {
      const result = await sendRequest('ping');

      if (result.result) {
        consola.success('WASM server is running');

        // Fetch detailed status
        const statusResult = await sendRequest('status');
        if (statusResult.result) {
          const { uptime, activeConnections, totalRequests, totalErrors } =
            statusResult.result;
          consola.box(`
  Status: Running
  Uptime: ${Math.round(uptime / 1000)}s
  Active connections: ${activeConnections}
  Total requests: ${totalRequests}
  Total errors: ${totalErrors}
  Socket: ${SOCKET_PATH}
          `);
        }

        process.exit(EXIT_CODES.success);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('ECONNREFUSED') ||
          err.message.includes('No such file'))
      ) {
        consola.warn('WASM server is not running');
        consola.info(
          'Start it with: wpm wasm-server start'
        );
        process.exit(EXIT_CODES.success);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        consola.error(`Failed to check server status: ${message}`);
        process.exit(EXIT_CODES.execution_error);
      }
    }
  },
});

/**
 * wpm wasm-server reset
 */
export const wasmServerReset = defineCommand({
  meta: {
    name: 'reset',
    description: 'Stop and restart the WASM server',
  },
  async run() {
    try {
      // Try to stop the running server
      try {
        await sendRequest('shutdown');
        consola.info('Stopped existing server');
      } catch {
        // Server not running, that's fine
      }

      // Wait a bit for socket to clean up
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Clean up socket file if it exists
      try {
        await fs.unlink(SOCKET_PATH);
      } catch {
        // File doesn't exist, that's fine
      }

      // Start a fresh server
      const server = new WasmServer({ socketPath: SOCKET_PATH });
      await server.start();

      consola.success('WASM server reset and running');
      process.exit(EXIT_CODES.success);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      consola.error(`Failed to reset WASM server: ${message}`);
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * Root wasm-server command with subcommands
 */
export const wasmServer = defineCommand({
  meta: {
    name: 'wasm-server',
    description:
      'Manage the long-lived WASM server (reduces CLI latency from 2,273ms → <500ms)',
  },
  subcommands: {
    start: wasmServerStart,
    stop: wasmServerStop,
    status: wasmServerStatus,
    reset: wasmServerReset,
  },
});
