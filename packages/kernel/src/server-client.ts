/**
 * server-client.ts
 * Client for communicating with the long-lived WASM server
 * Allows routing algorithm requests to server instead of local WASM init
 *
 * Usage:
 * ```ts
 * const client = new WasmServerClient();
 * if (await client.isAvailable()) {
 *   const result = await client.runAlgorithm('dfg', handle, { activity_key: 'concept:name' });
 * }
 * ```
 */

import * as net from 'net';
import * as path from 'path';
import * as os from 'os';

/**
 * JSON-RPC request to server
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface JsonRpcRequest {
  method: 'algorithm' | 'list' | 'ping' | 'shutdown';
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response from server
 */
interface JsonRpcResponse {
  result?: unknown;
  error?: string;
}

/**
 * Client for the long-lived WASM server
 */
export class WasmServerClient {
  private socketPath: string;
  private requestTimeout: number;

  constructor(config?: {
    socketPath?: string;
    requestTimeout?: number;
  }) {
    this.socketPath =
      config?.socketPath ??
      path.join(os.homedir(), '.wasm4pm', 'wasm-server.sock');
    this.requestTimeout = config?.requestTimeout ?? 10000;
  }

  /**
   * Check if server is available
   * Returns true if server is responding to ping, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.sendRequest('ping');
      return response.result !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Run an algorithm on the server
   * @param algorithm Algorithm ID (e.g., 'dfg', 'alpha')
   * @param handle Event log handle
   * @param params Algorithm parameters
   * @returns Result from the server
   * @throws Error if server is unavailable or returns an error
   */
  async runAlgorithm(
    algorithm: string,
    handle: string,
    params: Record<string, unknown> = {}
  ): Promise<{
    handle: string;
    algorithm: string;
    outputType: string;
    durationMs: number;
    params: Record<string, unknown>;
    hash: string;
    server_latency_ms: number;
  }> {
    const activityKey = (params.activity_key as string) ?? 'concept:name';
    const extraParams = { ...params };
    delete extraParams.activity_key;

    const response = await this.sendRequest('algorithm', {
      handle,
      algo: algorithm,
      activity_key: activityKey,
      extra_params: extraParams,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.result) {
      throw new Error('Server returned no result');
    }

    return response.result as any;
  }

  /**
   * List available algorithms on the server
   */
  async listAlgorithms(): Promise<
    Array<{ id: string; name: string; outputType: string }>
  > {
    const response = await this.sendRequest('list');

    if (response.error) {
      throw new Error(response.error);
    }

    const resultObj = response.result as Record<string, unknown> | undefined;
    const result = resultObj?.algorithms ?? [];
    return result as any;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Send a JSON-RPC request to the server and wait for response
   * @throws Error if connection fails or request times out
   */
  private sendRequest(
    method: string,
    params?: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      let timedOut = false;

      const socket = net.createConnection(this.socketPath, () => {
        const request = JSON.stringify({ method, params });
        socket.write(request + '\n');
      });

      const timer = setTimeout(() => {
        timedOut = true;
        socket.destroy();
        reject(new Error(`Server request timeout (${this.requestTimeout}ms)`));
      }, this.requestTimeout);

      let responseBuffer = '';

      socket.on('data', (chunk) => {
        responseBuffer += chunk.toString('utf8');

        // Look for complete JSON-RPC response (ends with newline)
        const lines = responseBuffer.split('\n');
        if (lines.length > 1) {
          try {
            const responseLine = lines[0];
            const result = JSON.parse(responseLine) as JsonRpcResponse;
            clearTimeout(timer);
            socket.destroy();
            resolve(result);
          } catch (err) {
            if (!timedOut) {
              clearTimeout(timer);
              socket.destroy();
              reject(err);
            }
          }
        }
      });

      socket.on('error', (err) => {
        if (!timedOut) {
          clearTimeout(timer);
          reject(err);
        }
      });

      socket.on('close', () => {
        if (!timedOut && responseBuffer) {
          // Try to parse any partial response
          try {
            const result = JSON.parse(responseBuffer) as JsonRpcResponse;
            clearTimeout(timer);
            resolve(result);
          } catch {
            if (!timedOut) {
              clearTimeout(timer);
              reject(new Error('Connection closed without response'));
            }
          }
        }
      });
    });
  }
}

/**
 * Check if WASM server is available (does not throw)
 */
export async function isWasmServerAvailable(
  socketPath?: string
): Promise<boolean> {
  const client = new WasmServerClient({ socketPath });
  return client.isAvailable();
}
