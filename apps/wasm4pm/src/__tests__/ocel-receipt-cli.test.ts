import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

function runCli(args: string[], cwd: string, timeoutMs = 15000): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code ?? 1 : 0,
          stdout,
          stderr,
        });
      }
    );
  });
}

describe('Embedded OCEL Execution Receipts', () => {
  const TEST_PAYLOAD_STRING = '{"test":"data"}';
  // Computed via hash-wasm blake3 of '{"test":"data"}'
  const RECOMPUTED_HASH = 'f8a1b7aae30d4b5a823e0ed91e0f4964ecff6286fd98b2e249f98c879404a11f';

  it('accepts receipt with complete embedded OCEL', async () => {
    const tempDir = path.join(tmpdir(), `wpm-ocel-receipt-${randomBytes(4).toString('hex')}`);
    await fs.mkdir(path.join(tempDir, '.wasm4pm/receipts'), { recursive: true });
    await fs.mkdir(path.join(tempDir, '.wasm4pm/results'), { recursive: true });
    
    const resultContent = JSON.stringify({ result: { test: "data" }, hash: null });
    
    const validReceipt = {
      run_id: 'test-1',
      command: 'run',
      output_hash: RECOMPUTED_HASH,
      status: 'success',
      timestamp: new Date().toISOString(),
      observed_path: {
        observed_ocel2: {
          ocel: '2.0',
          events: [],
          objects: [],
          eventTypes: [],
          objectTypes: []
        }
      }
    };
    
    await fs.writeFile(path.join(tempDir, '.wasm4pm/receipts/latest.json'), JSON.stringify(validReceipt));
    await fs.writeFile(path.join(tempDir, '.wasm4pm/results/test.json'), resultContent);
    
    const result = await runCli(['results', '--verify', '1'], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Output hash:');
    
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('refuses missing OCEL', async () => {
    const tempDir = path.join(tmpdir(), `wpm-ocel-receipt-${randomBytes(4).toString('hex')}`);
    await fs.mkdir(path.join(tempDir, '.wasm4pm/receipts'), { recursive: true });
    await fs.mkdir(path.join(tempDir, '.wasm4pm/results'), { recursive: true });
    
    const resultContent = JSON.stringify({ result: { test: "data" }, hash: null });
    
    const invalidReceipt = {
      run_id: 'test-1',
      command: 'run',
      output_hash: RECOMPUTED_HASH,
      status: 'success',
      timestamp: new Date().toISOString()
      // missing observed_path.ocel
    };
    
    await fs.writeFile(path.join(tempDir, '.wasm4pm/receipts/latest.json'), JSON.stringify(invalidReceipt));
    await fs.writeFile(path.join(tempDir, '.wasm4pm/results/test.json'), resultContent);
    
    const result = await runCli(['results', '--verify', '1'], tempDir);
    expect(result.exitCode).toBe(3); // EXIT_CODES.execution_error is 3
    expect(result.stderr).toContain('missing embedded OCEL path');
    
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

