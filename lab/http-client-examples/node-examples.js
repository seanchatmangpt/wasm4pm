/**
 * node-examples.js
 * Node.js examples for wasm4pm-service HTTP API
 */

const http = require('http');
const https = require('https');

const SERVICE_HOST = 'localhost';
const SERVICE_PORT = 3001;
const SERVICE_BASE_URL = `http://${SERVICE_HOST}:${SERVICE_PORT}`;

/**
 * HTTP client wrapper
 */
class HttpClient {
  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, SERVICE_BASE_URL);
      const options = {
        method,
        hostname: SERVICE_HOST,
        port: SERVICE_PORT,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'wasm4pm-node-client/26.4.5',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, body: parsed, headers: res.headers });
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  async get(path) {
    return this.request('GET', path);
  }

  async post(path, body) {
    return this.request('POST', path, body);
  }

  async delete(path) {
    return this.request('DELETE', path);
  }
}

/**
 * Example 1: Health Check
 */
async function example1_healthCheck() {
  console.log('\n===== Example 1: Health Check =====');
  const client = new HttpClient();
  try {
    const response = await client.get('/status');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.body, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 2: Get OpenAPI Documentation
 */
async function example2_getDocumentation() {
  console.log('\n===== Example 2: OpenAPI Documentation =====');
  const client = new HttpClient();
  try {
    const response = await client.get('/api/docs');
    console.log('Status:', response.status);
    console.log('OpenAPI Version:', response.body.openapi);
    console.log('API Info:', response.body.info);
    console.log('Endpoints:', Object.keys(response.body.paths));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 3: Submit a Run
 */
async function example3_submitRun() {
  console.log('\n===== Example 3: Submit Run =====');
  const client = new HttpClient();
  try {
    const config = `[algorithm]
name = "heuristic"
threshold = 0.5

[input]
file = "log.xes"

[output]
format = "json"`;

    const body = {
      config,
      input_file: '/path/to/log.xes',
      profile: 'production',
    };

    const response = await client.post('/run', body);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    return response.body.run_id;
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 4: Check Run Status
 */
async function example4_checkRunStatus(runId) {
  console.log('\n===== Example 4: Check Run Status =====');
  const client = new HttpClient();
  try {
    const response = await client.get(`/run/${runId}`);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.body, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 5: Watch Run Execution
 */
async function example5_watchRun(runId) {
  console.log('\n===== Example 5: Watch Run Execution =====');
  const client = new HttpClient();
  try {
    const response = await client.get(`/watch/${runId}`);
    console.log('Status:', response.status);
    console.log('Response (raw):', response.body.raw || 'JSONL stream');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 6: Explain Configuration
 */
async function example6_explainConfig() {
  console.log('\n===== Example 6: Explain Configuration =====');
  const client = new HttpClient();
  try {
    const config = `[algorithm]
name = "heuristic"
threshold = 0.5`;

    const response = await client.post('/explain', {
      config,
      mode: 'brief',
    });

    console.log('Status:', response.status);
    console.log('Explanation:', response.body.explanation);

    // Try full mode
    const fullResponse = await client.post('/explain', {
      config,
      mode: 'full',
    });

    console.log('\nFull Mode Explanation:', fullResponse.body.explanation);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 7: Cancel a Run
 */
async function example7_cancelRun(runId) {
  console.log('\n===== Example 7: Cancel Run =====');
  const client = new HttpClient();
  try {
    const response = await client.delete(`/run/${runId}`);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.body, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 8: Complete Workflow
 */
async function example8_completeWorkflow() {
  console.log('\n===== Example 8: Complete Workflow =====');
  const client = new HttpClient();

  try {
    // Step 1: Get status
    console.log('Step 1: Check server status');
    let response = await client.get('/status');
    console.log('Queue depth:', response.body.queued);
    console.log('Completed:', response.body.completed);

    // Step 2: Explain a config
    console.log('\nStep 2: Explain configuration');
    response = await client.post('/explain', {
      config: '[algorithm]\nname = "heuristic"',
      mode: 'brief',
    });
    console.log('Explanation:', response.body.explanation.substring(0, 100) + '...');

    // Step 3: Submit a run
    console.log('\nStep 3: Submit run');
    response = await client.post('/run', {
      config: '[test]\nkey = "value"',
    });
    const runId = response.body.run_id;
    console.log('Run ID:', runId);
    console.log('Initial Status:', response.body.status);

    // Step 4: Monitor progress
    console.log('\nStep 4: Monitor progress');
    for (let i = 0; i < 15; i++) {
      const statusResponse = await client.get(`/run/${runId}`);
      console.log(
        `Attempt ${i + 1}: Status=${statusResponse.body.status}, Progress=${statusResponse.body.progress}%`
      );

      if (statusResponse.body.status === 'completed') {
        console.log('Completion Receipt:', statusResponse.body.receipt);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Step 5: Check server status again
    console.log('\nStep 5: Check final server status');
    response = await client.get('/status');
    console.log('Completed runs:', response.body.completed);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 9: Error Handling
 */
async function example9_errorHandling() {
  console.log('\n===== Example 9: Error Handling =====');
  const client = new HttpClient();

  // Error 1: Invalid request (missing config)
  console.log('Error 1: Missing config parameter');
  try {
    const response = await client.post('/run', {});
    console.log('Status:', response.status);
    console.log('Error Code:', response.body.code);
  } catch (err) {
    console.error('Error:', err.message);
  }

  // Error 2: Non-existent run
  console.log('\nError 2: Non-existent run ID');
  try {
    const response = await client.get('/run/run_invalid_xyz');
    console.log('Status:', response.status);
    console.log('Error Code:', response.body.code);
  } catch (err) {
    console.error('Error:', err.message);
  }

  // Error 3: Non-existent endpoint
  console.log('\nError 3: Non-existent endpoint');
  try {
    const response = await client.get('/nonexistent');
    console.log('Status:', response.status);
    console.log('Error Code:', response.body.code);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Example 10: Rapid Successive Requests
 */
async function example10_rapidRequests() {
  console.log('\n===== Example 10: Rapid Successive Requests =====');
  const client = new HttpClient();

  try {
    // Submit 5 runs rapidly
    console.log('Submitting 5 runs rapidly...');
    const runIds = [];
    for (let i = 0; i < 5; i++) {
      const response = await client.post('/run', {
        config: `[test${i}]\nkey = "value"`,
      });
      runIds.push(response.body.run_id);
      console.log(`Run ${i + 1} submitted: ${response.body.run_id}`);
    }

    // Check server status
    const statusResponse = await client.get('/status');
    console.log('\nServer status:');
    console.log('Queue depth:', statusResponse.body.queued);
    console.log('Total runs submitted:', runIds.length);

    // Check individual statuses
    console.log('\nIndividual run statuses:');
    for (const runId of runIds) {
      const response = await client.get(`/run/${runId}`);
      console.log(`${runId}: ${response.body.status}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

/**
 * Main - Run examples
 */
async function main() {
  console.log('wasm4pm-service HTTP API Examples');
  console.log('Service URL:', SERVICE_BASE_URL);

  // Run examples
  await example1_healthCheck();
  await example2_getDocumentation();

  const runId = await example3_submitRun();
  if (runId) {
    await example4_checkRunStatus(runId);
    await example5_watchRun(runId);
    await example7_cancelRun(runId);
  }

  await example6_explainConfig();
  await example8_completeWorkflow();
  await example9_errorHandling();
  await example10_rapidRequests();

  console.log('\n===== All Examples Complete =====');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { HttpClient };
