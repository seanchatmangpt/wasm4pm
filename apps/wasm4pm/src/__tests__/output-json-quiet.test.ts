/**
 * Regression: --format json --quiet must still emit CommandResult JSON.
 * stop-proof-gate.sh runs: wpm proof audit --format json --quiet
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { emitResult, makeResult } from '../output.js';

describe('emitResult json + quiet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON to stdout when format=json and quiet=true', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const result = makeResult(
      'proof audit',
      { final_verdict: 'AndonPull(1_git_status)', gates_passed: 2, gates_failed: 3 },
      10,
      3
    );
    emitResult(result, { format: 'json', quiet: true, verbose: false });

    const out = writes.join('');
    expect(out.trim().startsWith('{')).toBe(true);
    const parsed = JSON.parse(out.trim()) as { payload?: { final_verdict?: string } };
    expect(parsed.payload?.final_verdict).toBe('AndonPull(1_git_status)');
  });

  it('suppresses human output when format=human and quiet=true', () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const result = makeResult('proof audit', { ok: true }, 1, 0);
    emitResult(result, { format: 'human', quiet: true, verbose: false });
    expect(writes.join('')).toBe('');
  });
});
