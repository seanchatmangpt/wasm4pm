#!/usr/bin/env node
/**
 * wasm4pm HTTP Service - Client Examples
 *
 * Examples for using the wasm4pm HTTP service API
 * Version: 26.4.5
 */

const http = require('http');

/**
 * Make HTTP request helper
 */
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Example 1: Basic Discovery Request
 */
async function example1_basicDiscovery() {
  console.log('\n=== Example 1: Basic Discovery ===');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/discover',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-api-key'
    }
  };

  const data = {
    logPath: 'data/eventlog.xes',
    algorithm: 'genetic',
    parameters: {
      populationSize: 50,
      generations: 100
    }
  };

  try {
    const response = await makeRequest(options, data);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.body, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 2: Analyze Event Log
 */
async function example2_analyzeLog() {
  console.log('\n=== Example 2: Analyze Log ===');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/analyze',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-api-key'
    }
  };

  const data = {
    logPath: 'data/eventlog.xes',
    metrics: ['event_statistics', 'trace_variants', 'activity_frequency']
  };

  try {
    const response = await makeRequest(options, data);
    console.log('Status:', response.status);
    console.log('Metrics:', JSON.stringify(response.body?.metrics, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 3: Conformance Checking
 */
async function example3_conformanceCheck() {
  console.log('\n=== Example 3: Conformance Checking ===');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/conformance',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-api-key'
    }
  };

  const data = {
    logPath: 'data/eventlog.xes',
    modelHandle: 'model_abc123',  // From previous discovery
    includeDeviations: true
  };

  try {
    const response = await makeRequest(options, data);
    console.log('Status:', response.status);
    console.log('Fitness:', response.body?.fitness);
    console.log('Deviations:', response.body?.deviationCount);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 4: System Status
 */
async function example4_systemStatus() {
  console.log('\n=== Example 4: System Status ===');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/status',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer your-api-key'
    }
  };

  try {
    const response = await makeRequest(options);
    console.log('Status:', response.status);
    console.log('Engine Status:', response.body?.engine?.status);
    console.log('Memory Usage:', response.body?.memory);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 5: WebSocket Streaming (requires ws library)
 */
async function example5_websocketStreaming() {
  console.log('\n=== Example 5: WebSocket Streaming ===');
  console.log('(Requires "npm install ws")');

  try {
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://localhost:3000/api/v1/stream');

    ws.on('open', () => {
      console.log('Connected to streaming endpoint');

      // Send discovery request
      ws.send(JSON.stringify({
        command: 'discover',
        logPath: 'data/eventlog.xes',
        algorithm: 'genetic'
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      console.log('Received:', message.type);
      if (message.type === 'progress') {
        console.log(`Progress: ${message.progress}%`);
      } else if (message.type === 'result') {
        console.log('Result:', message.data);
        ws.close();
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  } catch (error) {
    console.error('WebSocket not available:', error.message);
  }
}

/**
 * Example 6: Batch Processing
 */
async function example6_batchProcessing() {
  console.log('\n=== Example 6: Batch Processing ===');

  const logs = [
    'data/log1.xes',
    'data/log2.xes',
    'data/log3.xes'
  ];

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/discover',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-api-key'
    }
  };

  for (const logPath of logs) {
    console.log(`Processing: ${logPath}`);
    const data = {
      logPath,
      algorithm: 'dfg',
      parameters: {}
    };

    try {
      const response = await makeRequest(options, data);
      console.log(`  Status: ${response.status}`);
      if (response.status === 200) {
        console.log(`  Activities: ${response.body?.model?.activityCount}`);
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
  }
}

/**
 * Example 7: Error Handling
 */
async function example7_errorHandling() {
  console.log('\n=== Example 7: Error Handling ===');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/discover',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid-key'  // Bad auth
    }
  };

  const data = {
    logPath: 'nonexistent.xes',  // File doesn't exist
    algorithm: 'genetic'
  };

  try {
    const response = await makeRequest(options, data);
    console.log('Status:', response.status);
    console.log('Error:', response.body?.error);
    console.log('Code:', response.body?.code);
    console.log('Message:', response.body?.message);
  } catch (error) {
    console.error('Request error:', error.message);
  }
}

/**
 * Example 8: Using with fetch (modern approach)
 */
async function example8_fetchAPI() {
  console.log('\n=== Example 8: Using Fetch API ===');

  try {
    const response = await fetch('http://localhost:3000/api/v1/discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-api-key'
      },
      body: JSON.stringify({
        logPath: 'data/eventlog.xes',
        algorithm: 'alpha++',
        parameters: {}
      })
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Model:', data.model);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('wasm4pm HTTP Service - Client Examples');
  console.log('======================================');
  console.log('Make sure the service is running:');
  console.log('  wasm4pm-service --port 3000');
  console.log('');

  const example = process.argv[2] || 'all';

  try {
    if (example === 'all' || example === '1') await example1_basicDiscovery();
    if (example === 'all' || example === '2') await example2_analyzeLog();
    if (example === 'all' || example === '3') await example3_conformanceCheck();
    if (example === 'all' || example === '4') await example4_systemStatus();
    if (example === 'all' || example === '5') await example5_websocketStreaming();
    if (example === 'all' || example === '6') await example6_batchProcessing();
    if (example === 'all' || example === '7') await example7_errorHandling();
    if (example === 'all' || example === '8') await example8_fetchAPI();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run examples
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  example1_basicDiscovery,
  example2_analyzeLog,
  example3_conformanceCheck,
  example4_systemStatus,
  example5_websocketStreaming,
  example6_batchProcessing,
  example7_errorHandling,
  example8_fetchAPI
};
