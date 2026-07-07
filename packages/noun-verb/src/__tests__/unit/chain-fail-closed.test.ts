import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runChain } from '../../chain.js';
import { defineNoun } from '../../noun.js';
import { defineVerb } from '../../verb.js';
import type { BuildCliOptions } from '../../cli.js';

/**
 * A value whose `toJSON()` throws. `JSON.stringify` calls `toJSON()` when
 * present, so this reliably fails inside `writeJson()` just like an
 * oversized string would (`RangeError: Invalid string length`), without
 * needing to actually build a multi-hundred-MB string.
 */
class ExplodesOnSerialize {
  toJSON(): never {
    throw new Error('simulated RangeError: Invalid string length');
  }
}

describe('runChain fail-closed on output serialization failure', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | string | undefined;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  const noun = defineNoun({
    name: 'boom',
    verbs: [
      defineVerb({
        noun: 'boom',
        verb: 'make',
        summary: 'Returns a value that throws when JSON-serialized.',
        handler: () => new ExplodesOnSerialize(),
      }),
    ],
  });

  const options: BuildCliOptions = { name: 'test-cli' };

  function writtenStdout(): string {
    const call = stdoutSpy.mock.calls.find((args) => typeof args[0] === 'string');
    if (!call) throw new Error('process.stdout.write was never called with a string');
    return call[0] as string;
  }

  it('writes a valid fallback JSON envelope and sets a nonzero exit code instead of silently exiting 0', async () => {
    await runChain([noun], options, ['boom', 'make']);

    const output = writtenStdout();
    const parsed = JSON.parse(output);

    expect(parsed.error.code).toBe('output_serialization_failed');
    expect(typeof parsed.error.message).toBe('string');
    expect(parsed.steps).toEqual([{ noun: 'boom', verb: 'make', resultOmitted: true }]);

    expect(typeof process.exitCode).toBe('number');
    expect(process.exitCode).not.toBe(0);
  });
});
