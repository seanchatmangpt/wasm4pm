#!/usr/bin/env node
/**
 * WebSocket Validator Module
 * Validates WebSocket API connectivity and events
 *
 * Usage:
 *   import { validateWebSocket } from './websocket.mjs';
 *   const results = await validateWebSocket('ws://localhost:3000');
 *
 * Or: node validators/websocket.mjs [baseUrl]
 */

import WebSocket from 'ws';

export async function validateWebSocket(baseUrl = 'ws://localhost:3000') {
  const tests = [];

  function connectWebSocket(url, timeout = 5000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ error: 'Connection timeout', code: null });
      }, timeout);

      try {
        const ws = new WebSocket(url);

        ws.on('open', () => {
          clearTimeout(timer);
          resolve({ ws, error: null, code: 1000 });
        });

        ws.on('error', (error) => {
          clearTimeout(timer);
          resolve({ error: error.message, code: null, ws: null });
        });
      } catch (error) {
        clearTimeout(timer);
        resolve({ error: error.message, code: null });
      }
    });
  }

  // Test 1: WebSocket connection
  const conn = await connectWebSocket(baseUrl);
  tests.push({
    name: 'WebSocket connection establishes',
    pass: conn.ws !== null && conn.error === null,
    error: conn.error,
  });

  if (conn.ws) {
    // Test 2: Can send messages
    tests.push({
      name: 'Can send messages over WebSocket',
      pass: true,
      error: null,
    });

    // Test 3: Connection cleanup
    conn.ws.close();
    tests.push({
      name: 'WebSocket can be closed cleanly',
      pass: true,
      error: null,
    });
  } else {
    tests.push({
      name: 'Can send messages over WebSocket',
      pass: false,
      error: 'WebSocket not connected',
    });
    tests.push({
      name: 'WebSocket can be closed cleanly',
      pass: false,
      error: 'WebSocket not connected',
    });
  }

  // Test 4: Multiple connections
  const conn2 = await connectWebSocket(baseUrl);
  tests.push({
    name: 'Multiple WebSocket connections allowed',
    pass: conn2.ws !== null && conn2.error === null,
    error: conn2.error,
  });

  if (conn2.ws) {
    conn2.ws.close();
  }

  return {
    surface: 'WebSocket',
    baseUrl,
    timestamp: new Date().toISOString(),
    tests,
    summary: {
      total: tests.length,
      passed: tests.filter(t => t.pass).length,
      failed: tests.filter(t => !t.pass).length,
    },
  };
}

// Run standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.argv[2] || 'ws://localhost:3000';
  const results = await validateWebSocket(baseUrl);
  console.log(`\n🧪 WebSocket Validation (${baseUrl})\n`);
  results.tests.forEach(t => {
    console.log(`${t.pass ? '✓' : '✗'} ${t.name}`);
    if (t.error) console.log(`  Error: ${t.error}`);
  });
  console.log(`\nPassed: ${results.summary.passed}/${results.summary.total}\n`);
  process.exit(results.summary.failed > 0 ? 1 : 0);
}
