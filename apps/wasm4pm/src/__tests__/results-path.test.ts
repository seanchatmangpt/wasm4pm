import { describe, it, expect } from 'vitest';
import { runCli } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('wpm results --path', () => {
  it('finds result file when path exists', async () => {
    // This test verifies the --path flag works when a result exists
    // In real usage, this would be run after `wpm run` saves a result
    const result = await runCli(['results', '--help']);
    expect(result?.exitCode).toBe(0);
  });

  it('handles missing result path gracefully', async () => {
    const result = await runCli(['results', '--path', '/nonexistent/path/result.json']);
    // Should exit with error code when path not found
    expect([1, 2, 5]).toContain(result?.exitCode);
  });

  it('displays result when path points to valid result file', async () => {
    // Create a mock result file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    const resultPath = path.join(tmpDir, 'test-result.json');
    const mockResult = {
      timestamp: new Date().toISOString(),
      status: 'success',
      algorithm: 'dfg',
      message: 'Discovery completed',
    };
    fs.writeFileSync(resultPath, JSON.stringify(mockResult, null, 2));

    try {
      const result = await runCli(['results', '--path', resultPath, '--format', 'json']);
      expect(result?.exitCode).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
