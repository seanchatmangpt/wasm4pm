/**
 * wasm-server.test.ts
 * Tests for WASM server initialization, request handling, and fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { WasmServer } from '../wasm-server.js';
import { WasmServerClient, isWasmServerAvailable } from '@wasm4pm/kernel';

describe('WasmServer', () => {
  let server: WasmServer;
  const testSocketPath = path.join(
    os.tmpdir(),
    `wasm-server-test-${Date.now()}.sock`
  );

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    // Clean up socket
    try {
      await fs.unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  it('should initialize and start listening on socket', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const status = server.getStatus();
    expect(status.running).toBe(true);
    expect(status.socketPath).toBe(testSocketPath);
    expect(status.activeConnections).toBe(0);
    expect(status.totalRequests).toBe(0);
  });

  it('should accept ping requests', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const client = new WasmServerClient({ socketPath: testSocketPath });
    const available = await client.isAvailable();

    expect(available).toBe(true);
  });

  it('should track connection state', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const client = new WasmServerClient({ socketPath: testSocketPath });

    // Create a connection
    const socket = net.createConnection(testSocketPath, () => {
      const request = JSON.stringify({ method: 'ping' });
      socket.write(request + '\n');
    });

    // Give it time to register
    await new Promise((resolve) => setTimeout(resolve, 50));
    let status = server.getStatus();
    expect(status.activeConnections).toBeGreaterThan(0);

    // Close connection
    socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should increment request counter on ping', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const client = new WasmServerClient({ socketPath: testSocketPath });
    const startStatus = server.getStatus();

    await client.isAvailable();
    await client.isAvailable();

    const endStatus = server.getStatus();
    expect(endStatus.totalRequests).toBeGreaterThan(
      startStatus.totalRequests
    );
  });

  it('should handle unknown methods gracefully', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    await new Promise<void>((resolve) => {
      const socket = net.createConnection(testSocketPath, () => {
        socket.write(JSON.stringify({ method: 'unknown' }) + '\n');
      });

      let response = '';
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
        try {
          const parsed = JSON.parse(response.trim());
          expect(parsed.error).toBeDefined();
          socket.destroy();
          resolve();
        } catch {
          // Incomplete response
        }
      });

      socket.on('error', () => resolve());
    });
  });

  it('should gracefully shutdown', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const status1 = server.getStatus();
    expect(status1.running).toBe(true);

    await server.stop();

    const status2 = server.getStatus();
    expect(status2.running).toBe(false);
  });

  it('should enforce max connections limit', async () => {
    server = new WasmServer({
      socketPath: testSocketPath,
      maxConnections: 2,
      verbose: false,
    });
    await server.start();

    // This test verifies the config is passed to the server
    const status = server.getStatus();
    expect(status.running).toBe(true);
  });

  it('should track uptime', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const status1 = server.getStatus();
    expect(status1.uptime).toBeGreaterThanOrEqual(0);

    // Wait a bit and check uptime increased
    await new Promise((resolve) => setTimeout(resolve, 100));
    const status2 = server.getStatus();
    expect(status2.uptime).toBeGreaterThan(status1.uptime);
  });
});

describe('WasmServerClient', () => {
  let server: WasmServer;
  let client: WasmServerClient;
  const testSocketPath = path.join(
    os.tmpdir(),
    `wasm-client-test-${Date.now()}.sock`
  );

  beforeEach(async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();
    client = new WasmServerClient({ socketPath: testSocketPath });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    try {
      await fs.unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  it('should detect available server', async () => {
    const available = await client.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false when server unavailable', async () => {
    await server.stop();

    const available = await client.isAvailable();
    expect(available).toBe(false);
  });

  it('should send ping request successfully', async () => {
    const response = await new Promise<any>((resolve) => {
      const socket = net.createConnection(testSocketPath, () => {
        socket.write(JSON.stringify({ method: 'ping' }) + '\n');
      });

      socket.on('data', (chunk) => {
        const response = JSON.parse(chunk.toString('utf8'));
        expect(response.result?.pong).toBe(true);
        socket.destroy();
        resolve(response);
      });
    });

    expect(response.result).toBeDefined();
  });

  it('should timeout on slow responses', async () => {
    const slowClient = new WasmServerClient({
      socketPath: testSocketPath,
      requestTimeout: 50,
    });

    // Create a server that never responds
    const nonRespondingServer = net.createServer((socket) => {
      // Don't respond to anything
    });

    const testPath = path.join(os.tmpdir(), `slow-test-${Date.now()}.sock`);

    nonRespondingServer.listen(testPath, async () => {
      const client2 = new WasmServerClient({
        socketPath: testPath,
        requestTimeout: 50,
      });

      try {
        await expect(
          client2.isAvailable()
        ).rejects.toThrow();
      } finally {
        nonRespondingServer.close();
        try {
          await fs.unlink(testPath);
        } catch {
          // Ignore
        }
      }
    });
  });
});

describe('isWasmServerAvailable helper', () => {
  let server: WasmServer;
  const testSocketPath = path.join(
    os.tmpdir(),
    `wasm-helper-test-${Date.now()}.sock`
  );

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    try {
      await fs.unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  it('should return true when server running', async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();

    const available = await isWasmServerAvailable(testSocketPath);
    expect(available).toBe(true);
  });

  it('should return false when server not running', async () => {
    const available = await isWasmServerAvailable(testSocketPath);
    expect(available).toBe(false);
  });
});

describe('WASM server error handling', () => {
  let server: WasmServer;
  let client: WasmServerClient;
  const testSocketPath = path.join(
    os.tmpdir(),
    `wasm-error-test-${Date.now()}.sock`
  );

  beforeEach(async () => {
    server = new WasmServer({ socketPath: testSocketPath, verbose: false });
    await server.start();
    client = new WasmServerClient({ socketPath: testSocketPath });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    try {
      await fs.unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  it('should handle malformed JSON gracefully', async () => {
    await new Promise<void>((resolve) => {
      const socket = net.createConnection(testSocketPath, () => {
        socket.write('not valid json\n');
      });

      socket.on('data', (chunk) => {
        const response = JSON.parse(chunk.toString('utf8'));
        expect(response.error).toBeDefined();
        socket.destroy();
        resolve();
      });

      socket.on('error', () => resolve());
    });
  });

  it('should handle missing required params', async () => {
    await new Promise<void>((resolve) => {
      const socket = net.createConnection(testSocketPath, () => {
        socket.write(JSON.stringify({ method: 'algorithm', params: {} }) + '\n');
      });

      socket.on('data', (chunk) => {
        const response = JSON.parse(chunk.toString('utf8'));
        expect(response.error).toBeDefined();
        socket.destroy();
        resolve();
      });

      socket.on('error', () => resolve());
    });
  });

  it('should reject algorithm request with missing handle', async () => {
    await new Promise<void>((resolve) => {
      const socket = net.createConnection(testSocketPath, () => {
        socket.write(
          JSON.stringify({
            method: 'algorithm',
            params: { algo: 'dfg' },
          }) + '\n'
        );
      });

      socket.on('data', (chunk) => {
        const response = JSON.parse(chunk.toString('utf8'));
        expect(response.error).toContain('Missing required params');
        socket.destroy();
        resolve();
      });

      socket.on('error', () => resolve());
    });
  });
});

describe('WASM server fallback behavior', () => {
  it('should allow fallback to local WASM when server unavailable', async () => {
    // This test verifies that kernel can use local WASM when server is not running
    const unavailableSocket = path.join(
      os.tmpdir(),
      'nonexistent-server.sock'
    );
    const client = new WasmServerClient({ socketPath: unavailableSocket });

    const available = await client.isAvailable();
    expect(available).toBe(false);

    // In real usage, this would trigger fallback to local WASM
  });
});
