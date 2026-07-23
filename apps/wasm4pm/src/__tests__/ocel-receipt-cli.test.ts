/**
 * Migrated from the old top-level `wpm results --verify` onto
 * `wpm evidence report --verify` (nouns/_removed.ts:
 * `{ old: 'results', replacement: 'evidence report' }`).
 *
 * `evidence report` is a thin bridge over the unmodified legacy
 * `commands/results.ts` (see `nouns/_bridge.ts`): the bridge forces
 * `--format json --quiet` and returns the legacy command's own JSON body
 * verbatim as the verb's result — there is no additional framework
 * wrapper on top, so this bridged verb's stdout is still literally the
 * old `{command,status,payload,meta}` shape (that's the legacy command's
 * own envelope, not something the noun-verb framework adds).
 *
 * The legacy `results --verify` handler reports a data-integrity failure
 * via `integrity: 'missing_ocel'`/`verified: false` and its own
 * `exit_code: 4` (`EXIT_CODES.partial_failure` — "the verify command ran
 * successfully but found the result is no longer intact," per
 * `commands/results.ts`'s own comment), which the bridge (`nouns/_bridge.ts`)
 * now correctly propagates to the real process exit code. This is a
 * different (and more semantically correct) code than the old test's
 * `EXIT_CODES.execution_error` (3) assumption — `partial_failure` (4) is
 * right for "ran fine, found tampering/corruption," reserving
 * `execution_error` for the command itself failing to run. Verified live
 * below, not assumed.
 */
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
        const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

describe('wpm evidence report --verify (was: wpm results --verify) — embedded OCEL receipts', () => {
  const RECOMPUTED_HASH = 'f8a1b7aae30d4b5a823e0ed91e0f4964ecff6286fd98b2e249f98c879404a11f';

  it('accepts receipt with complete embedded OCEL', async () => {
    const tempDir = path.join(tmpdir(), `wpm-ocel-receipt-${randomBytes(4).toString('hex')}`);
    await fs.mkdir(path.join(tempDir, '.wasm4pm/receipts'), { recursive: true });
    await fs.mkdir(path.join(tempDir, '.wasm4pm/results'), { recursive: true });

    const resultContent = JSON.stringify({ result: { test: 'data' }, hash: null });

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
          objectTypes: [],
        },
      },
    };

    await fs.writeFile(path.join(tempDir, '.wasm4pm/receipts/latest.json'), JSON.stringify(validReceipt));
    await fs.writeFile(path.join(tempDir, '.wasm4pm/results/test.json'), resultContent);

    const result = await runCli(['evidence', 'report', '--verify', '1'], tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.payload.integrity).toBe('ok');
    expect(parsed.payload.verified).toBe(true);
    expect(parsed.payload.recomputed_output_hash).toBe(RECOMPUTED_HASH);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('refuses missing OCEL: nonzero exit (partial_failure=4) and payload.integrity flags the tamper/corruption', async () => {
    const tempDir = path.join(tmpdir(), `wpm-ocel-receipt-${randomBytes(4).toString('hex')}`);
    await fs.mkdir(path.join(tempDir, '.wasm4pm/receipts'), { recursive: true });
    await fs.mkdir(path.join(tempDir, '.wasm4pm/results'), { recursive: true });

    const resultContent = JSON.stringify({ result: { test: 'data' }, hash: null });

    const invalidReceipt = {
      run_id: 'test-1',
      command: 'run',
      output_hash: RECOMPUTED_HASH,
      status: 'success',
      timestamp: new Date().toISOString(),
      // missing observed_path.observed_ocel2
    };

    await fs.writeFile(path.join(tempDir, '.wasm4pm/receipts/latest.json'), JSON.stringify(invalidReceipt));
    await fs.writeFile(path.join(tempDir, '.wasm4pm/results/test.json'), resultContent);

    const result = await runCli(['evidence', 'report', '--verify', '1'], tempDir);
    const parsed = JSON.parse(result.stdout);

    expect(parsed.payload.integrity).toBe('missing_ocel');
    expect(parsed.payload.verified).toBe(false);
    expect(parsed.exit_code).toBe(4); // legacy EXIT_CODES.partial_failure, embedded in the legacy envelope
    expect(result.exitCode).toBe(4); // ...and now correctly propagated to the real process exit code

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
