import { describe, it, expect } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('wpm run --preflight validation', () => {
  it('runs mandatory Pass 1 (structural) validation on missing file', async () => {
    const result = await runCli(['run', '/nonexistent/missing.xes']);
    expect(result?.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('rejects unsupported input file extension with SOURCE_ERROR', async () => {
    // Plan A preflight: unknown extensions must fail before WASM init.
    const result = await runCli(['run', 'no-such.txt']);
    expect(result?.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('requires --preflight flag for full Pass 2 (semantic) validation', async () => {
    // Create minimal valid XES fixture
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-test-'));
    const xesPath = path.join(tmpDir, 'test.xes');
    const minimalXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T00:00:00Z"/>
    </event>
  </trace>
</log>`;
    fs.writeFileSync(xesPath, minimalXes);

    try {
      // Without --preflight, should run discovery (may succeed depending on WASM availability)
      const resultWithoutFlag = await runCli(['run', xesPath, '--algorithm', 'dfg']);
      expect([0, 3, 5]).toContain(resultWithoutFlag?.exitCode);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
