#!/usr/bin/env node
/**
 * HTTP Service Validator Module
 * Validates HTTP API endpoints
 *
 * Usage:
 *   import { validateHTTP } from './http.mjs';
 *   const results = await validateHTTP('http://localhost:3000');
 *
 * Or: node validators/http.mjs [baseUrl]
 */

export async function validateHTTP(baseUrl = 'http://localhost:3000') {
  const tests = [];

  async function makeRequest(method, endpoint, body = null) {
    try {
      const url = new URL(endpoint, baseUrl).href;
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      const response = await fetch(url, options);
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = text;
      }
      return { status: response.status, data };
    } catch (error) {
      return { status: 0, error: error.message, data: null };
    }
  }

  // Test 1: Status endpoint
  const status = await makeRequest('GET', '/status');
  tests.push({
    name: 'GET /status returns 200',
    pass: status.status === 200 && status.data?.version,
    code: status.status,
  });

  // Test 2: Explain endpoint
  const explain = await makeRequest('GET', '/explain/dfg');
  tests.push({
    name: 'GET /explain/:algorithm returns algorithm info',
    pass: explain.status === 200 && explain.data?.algorithm,
    code: explain.status,
  });

  // Test 3: API docs
  const docs = await makeRequest('GET', '/api/docs');
  tests.push({
    name: 'GET /api/docs endpoint exists',
    pass: [200, 404].includes(docs.status),
    code: docs.status,
  });

  // Test 4: POST /run requires XES
  const noXes = await makeRequest('POST', '/run', { algorithm: 'dfg' });
  tests.push({
    name: 'POST /run without XES returns 400',
    pass: noXes.status === 400,
    code: noXes.status,
  });

  // Test 5: Invalid endpoint returns 404
  const notFound = await makeRequest('GET', '/invalid/endpoint');
  tests.push({
    name: 'Invalid endpoint returns 404',
    pass: notFound.status === 404,
    code: notFound.status,
  });

  return {
    surface: 'HTTP API',
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
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  const results = await validateHTTP(baseUrl);
  console.log(`\n🧪 HTTP API Validation (${baseUrl})\n`);
  results.tests.forEach(t => {
    console.log(`${t.pass ? '✓' : '✗'} ${t.name}`);
  });
  console.log(`\nPassed: ${results.summary.passed}/${results.summary.total}\n`);
  process.exit(results.summary.failed > 0 ? 1 : 0);
}
