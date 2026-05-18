/**
 * server-client.test.ts
 * Tests for kernel server client round-trip correctness
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import { WasmServerClient, isWasmServerAvailable } from '../server-client.js';

/**
 * Mock WASM server for testing
 */
class MockWasmServer {
  private server?: net.Server;
  socketPath: string;
  requestLog: Array<{ method: string; params?: Record<string, unknown> }> = [];

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');

          while (lines.length > 1) {
            const line = lines.shift()!.trim();
            buffer = lines.join('\n');

            if (!line) continue;

            try {
              const request = JSON.parse(line);
              this.requestLog.push(request);

              let response: any;

              if (request.method === 'ping') {
                response = {
                  result: { pong: true, timestamp: Date.now() },
                };
              } else if (request.method === 'algorithm') {
                const { handle, algo, activity_key } = request.params || {};
                if (!handle || !algo) {
                  response = { error: 'Missing required params: handle, algo' };
                } else {
                  response = {
                    result: {
                      handle: `${algo}_result_${Date.now()}`,
                      algorithm: algo,
                      outputType: 'dfg',
                      durationMs: Math.random() * 100,
                      params: { activity_key },
                      hash: `hash_${Date.now()}`,
                      server_latency_ms: Math.random() * 50,
                    },
                  };
                }
              } else if (request.method === 'list') {
                response = {
                  result: {
                    algorithms: [
                      { id: 'dfg', name: 'DFG', outputType: 'dfg' },
                      { id: 'alpha', name: 'Alpha++', outputType: 'petrinet' },
                    ],
                  },
                };
              } else {
                response = { error: 'Unknown method' };
              }

              socket.write(JSON.stringify(response) + '\n');
            } catch (err) {
              socket.write(JSON.stringify({ error: 'Parse error' }) + '\n');
            }
          }
        });

        socket.on('error', () => {
          // Ignore
        });
      });

      this.server.listen(this.socketPath, resolve);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

describe('WasmServerClient', () => {
  let mockServer: MockWasmServer;
  let client: WasmServerClient;
  const socketPath = path.join(os.tmpdir(), `kernel-test-${Date.now()}.sock`);

  beforeEach(async () => {
    mockServer = new MockWasmServer(socketPath);
    await mockServer.start();
    client = new WasmServerClient({ socketPath });
  });

  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop();
    }
  });

  it('should check server availability with ping', async () => {
    const available = await client.isAvailable();
    expect(available).toBe(true);
    expect(mockServer.requestLog.length).toBeGreaterThan(0);
    expect(mockServer.requestLog[0].method).toBe('ping');
  });

  it('should return false when server unavailable', async () => {
    await mockServer.stop();
    const available = await client.isAvailable();
    expect(available).toBe(false);
  });

  it('should run algorithm on server', async () => {
    const result = await client.runAlgorithm('dfg', 'handle_123', {
      activity_key: 'concept:name',
    });

    expect(result.handle).toBeDefined();
    expect(result.algorithm).toBe('dfg');
    expect(result.outputType).toBe('dfg');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.server_latency_ms).toBeGreaterThanOrEqual(0);

    // Verify request was logged
    const algRequest = mockServer.requestLog.find(
      (r) => r.method === 'algorithm'
    );
    expect(algRequest).toBeDefined();
    expect(algRequest?.params?.algo).toBe('dfg');
    expect(algRequest?.params?.handle).toBe('handle_123');
  });

  it('should pass extra params to server', async () => {
    await client.runAlgorithm('alpha', 'handle_456', {
      activity_key: 'custom:key',
      min_support: 0.5,
      noise_threshold: 0.2,
    });

    const algRequest = mockServer.requestLog.find(
      (r) => r.method === 'algorithm'
    );
    expect(algRequest?.params?.activity_key).toBe('custom:key');
    expect(algRequest?.params?.extra_params?.min_support).toBe(0.5);
    expect(algRequest?.params?.extra_params?.noise_threshold).toBe(0.2);
  });

  it('should list algorithms on server', async () => {
    const algorithms = await client.listAlgorithms();

    expect(algorithms).toBeInstanceOf(Array);
    expect(algorithms.length).toBeGreaterThan(0);
    expect(algorithms[0].id).toBeDefined();
    expect(algorithms[0].name).toBeDefined();
    expect(algorithms[0].outputType).toBeDefined();
  });

  it('should throw error when server returns error', async () => {
    await expect(
      client.runAlgorithm('unknown', '', {})
    ).rejects.toThrow();
  });

  it('should handle connection timeout', async () => {
    const slowClient = new WasmServerClient({
      socketPath: path.join(os.tmpdir(), 'nonexistent.sock'),
      requestTimeout: 50,
    });

    await expect(slowClient.isAvailable()).rejects.toThrow();
  });

  it('should handle missing required params', async () => {
    await expect(
      client.runAlgorithm('dfg', '', {})
    ).rejects.toThrow('Missing required params');
  });

  it('should have round-trip correctness', async () => {
    // Test that multiple requests return consistent structure
    const result1 = await client.runAlgorithm('dfg', 'handle_1', {});
    const result2 = await client.runAlgorithm('alpha', 'handle_2', {});

    expect(result1.handle).toBeDefined();
    expect(result1.algorithm).toBe('dfg');
    expect(result1.outputType).toBe('dfg');

    expect(result2.handle).toBeDefined();
    expect(result2.algorithm).toBe('alpha');
    expect(result2.outputType).toBe('petrinet');
  });

  it('should handle concurrent requests', async () => {
    const promises = [
      client.runAlgorithm('dfg', 'h1', {}),
      client.runAlgorithm('alpha', 'h2', {}),
      client.runAlgorithm('dfg', 'h3', {}),
    ];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.handle).toBeDefined();
      expect(result.server_latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have correct param structure', async () => {
    const result = await client.runAlgorithm('dfg', 'handle_123', {
      activity_key: 'concept:name',
    });

    expect(result.params).toBeDefined();
    expect(result.params.activity_key).toBe('concept:name');
  });
});

describe('isWasmServerAvailable helper', () => {
  let mockServer: MockWasmServer;
  const socketPath = path.join(os.tmpdir(), `helper-test-${Date.now()}.sock`);

  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop();
    }
  });

  it('should return true when server available', async () => {
    mockServer = new MockWasmServer(socketPath);
    await mockServer.start();

    const available = await isWasmServerAvailable(socketPath);
    expect(available).toBe(true);
  });

  it('should return false when server unavailable', async () => {
    const available = await isWasmServerAvailable(socketPath);
    expect(available).toBe(false);
  });

  it('should not throw on unavailable server', async () => {
    expect(
      async () => await isWasmServerAvailable(socketPath)
    ).not.toThrow();
  });
});
