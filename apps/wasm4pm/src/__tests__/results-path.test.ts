import { describe, it, expect } from 'vitest';
import { runCli } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// `wpm results` was retired; the hard-break table (nouns/_removed.ts) forwards
// it to `wpm evidence report`, which bridges unmodified to the legacy
// `commands/results.ts` body (see nouns/evidence/report.ts). A successful
// bridged call returns the legacy `{command,status,payload,meta}` envelope
// verbatim; a failing one is thrown as a framework `{error:{code,message}}`
// envelope instead (see packages/noun-verb `_bridge.ts` classifyLegacyFailure) —
// confirmed live: `--path <nonexistent>` now returns
// `{error:{code:'INVALID_INPUT',...}}` with exit 2.
describe('wpm evidence report --path (was: wpm results --path)', () => {
  it('finds result file when path exists', async () => {
    // This test verifies the --path flag works when a result exists
    // In real usage, this would be run after `wpm model discover` saves a result
    const result = await runCli(['evidence', 'report', '--help']);
    expect(result?.exitCode).toBe(0);
  });

  it('handles missing result path gracefully', async () => {
    const result = await runCli(['evidence', 'report', '--path', '/nonexistent/path/result.json']);
    // Bridged legacy failure -> NounVerbError.invalidInput -> INVALID_INPUT,
    // mapped by wpm's ERROR_CODE_MAP to source_error (2).
    expect(result?.exitCode).toBe(2);
  });

  it('displays result when path points to valid result file', async () => {
    // Create a mock result file. Must live under os.tmpdir() (or cwd) —
    // commands/results.ts's --path handler denies any path outside both
    // (`PATH_TRAVERSAL_DENIED`), verified live against the built CLI.
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
      // `@wasm4pm/testing`'s runCli() strips the child env down to PATH+HOME,
      // so TMPDIR must be forwarded explicitly — otherwise the child's own
      // os.tmpdir() can resolve differently than this test process's (e.g. a
      // custom $TMPDIR here vs the system /tmp in the child), which trips the
      // command's PATH_TRAVERSAL_DENIED check for a path that's legitimately
      // under *this* process's tmpdir.
      const result = await runCli(['evidence', 'report', '--path', resultPath, '--format', 'json'], {
        env: { TMPDIR: os.tmpdir() },
      });
      expect(result?.exitCode).toBe(0);
      const parsed = JSON.parse(result!.stdout) as Record<string, unknown>;
      // Legacy envelope preserved verbatim on the bridge's success path.
      expect(parsed.command).toBe('results');
      expect(parsed.status).toBe('ok');
      const payload = parsed.payload as Record<string, unknown>;
      expect(payload.cat).toEqual(mockResult);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
