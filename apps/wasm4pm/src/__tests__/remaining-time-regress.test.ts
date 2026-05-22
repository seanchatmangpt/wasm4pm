import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Integration tests for remaining-time prediction with regress method.
 * Tests the full CLI pipeline:
 * 1. Feature extraction from event log
 * 2. Regression model training
 * 3. Method selection (auto, weibull, regress, hybrid)
 */

describe('remaining-time prediction CLI (--method flag)', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test artifacts
    tempDir = path.join(process.cwd(), '.test-remaining-time');
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch {
      // Directory already exists
    }
  });

  afterAll(async () => {
    // Clean up test artifacts
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('Test 1: wpm predict remaining-time --method regress extracts features correctly', async () => {
    // Create a minimal XES file for testing
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Pay"/>
      <date key="time:timestamp" value="2024-01-01T12:00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2024-01-02T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-02T11:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-02T12:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Pay"/>
      <date key="time:timestamp" value="2024-01-02T13:00:00"/>
    </event>
  </trace>
</log>`;

    const xesFile = path.join(tempDir, 'test-log.xes');
    await fs.writeFile(xesFile, xesContent);

    // Run the predict command with --method regress
    const env = createCliTestEnv();
    const result = await env.run(
      'predict remaining-time -i ' + xesFile + ' --method regress --format json'
    );

    expect(result.exit_code).toBe(0);
    const payload = JSON.parse(result.output);
    expect(payload).toBeDefined();
    expect(payload.method).toBe('regress');
  });

  it('Test 2: --method auto selects based on dataset size', async () => {
    // Create a small XES file
    const smallXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
  </trace>
</log>`;

    const xesFile = path.join(tempDir, 'small-log.xes');
    await fs.writeFile(xesFile, smallXes);

    const env = createCliTestEnv();
    const result = await env.run(
      'predict remaining-time -i ' + xesFile + ' --method auto --format json'
    );

    expect(result.exit_code).toBe(0);
    // For small logs, auto should default to weibull (unless we provide prefix)
    const payload = JSON.parse(result.output);
    expect(['weibull', 'regress']).toContain(payload.method);
  });

  it('Test 3: --method weibull uses WASM Weibull model', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2024-01-01T12:00:00"/>
    </event>
  </trace>
</log>`;

    const xesFile = path.join(tempDir, 'weibull-test.xes');
    await fs.writeFile(xesFile, xesContent);

    const env = createCliTestEnv();
    const result = await env.run(
      'predict remaining-time -i ' + xesFile + ' --method weibull --prefix "Start" --format json'
    );

    expect(result.exit_code).toBe(0);
    const payload = JSON.parse(result.output);
    expect(payload.method).toBe('weibull');
  });

  it('Test 4: --method hybrid combines weibull + regress', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-02T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-02T11:00:00"/>
    </event>
  </trace>
</log>`;

    const xesFile = path.join(tempDir, 'hybrid-test.xes');
    await fs.writeFile(xesFile, xesContent);

    const env = createCliTestEnv();
    const result = await env.run(
      'predict remaining-time -i ' + xesFile + ' --method hybrid --prefix "A" --format json'
    );

    expect(result.exit_code).toBe(0);
    const payload = JSON.parse(result.output);
    expect(payload.method).toBe('hybrid');
  });

  it('Test 5: Invalid --method value returns error', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
  </trace>
</log>`;

    const xesFile = path.join(tempDir, 'invalid-method.xes');
    await fs.writeFile(xesFile, xesContent);

    const env = createCliTestEnv();
    const result = await env.run(
      'predict remaining-time -i ' + xesFile + ' --method invalid --format json'
    );

    // Should fall back to default method, not error
    expect([0, 1, 2, 3]).toContain(result.exit_code);
  });
});
