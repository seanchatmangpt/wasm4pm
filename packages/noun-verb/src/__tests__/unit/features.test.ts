/**
 * End-to-end tests for the day-one framework features added on top of
 * the core (defineVerb/defineNoun/buildCli): --introspect, ++ chaining,
 * @- stdin extraction, and onResult/onError middleware hooks.
 *
 * Lives under unit/ (not alongside the pure-function tests) because it
 * spies on process.stdout/stderr with mockImplementation, same as
 * ../unit/cli.test.ts — see .claude/hooks/test-purity.sh.
 */

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../entry.js';
import { calcNoun, buildSpecimenCli } from '../specimen-calc.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function stdoutText(): string {
  return stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
}

function stderrText(): string {
  return stderrSpy.mock.calls.map((call) => String(call[0])).join('');
}

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.exitCode = undefined;
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
});

describe('--introspect (single verb)', () => {
  it('prints the tool schema instead of running the handler', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'add', '--introspect'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toMatchObject({
      name: 'calc_add',
      description: 'Add two numbers',
      input_schema: { type: 'object' },
    });
    expect(parsed.input_schema.required).toEqual(['left', 'right']);
    expect(process.exitCode).toBe(0);
  });

  it('does not execute the handler (invalid operands would otherwise error)', async () => {
    const cli = buildSpecimenCli();
    // These would fail parseOperand() validation if the handler ran.
    await runCommand(cli, { rawArgs: ['calc', 'divide', 'not-a-number', 'also-not', '--introspect'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed.name).toBe('calc_divide');
    expect(parsed).not.toHaveProperty('error');
  });
});

describe('--introspect (whole registry)', () => {
  it('wpm --introspect emits a schema for every verb, via buildCli + citty runCommand directly', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['--introspect'] });

    const parsed = JSON.parse(stdoutText());
    expect(Array.isArray(parsed.tools)).toBe(true);
    expect(parsed.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'calc_add',
      'calc_divide',
      'calc_multiply',
      'calc_square',
    ]);
  });

  it('wpm --introspect also works through runCli()', async () => {
    await runCli([calcNoun], { name: 'calc-cli', version: '0.0.0' }, ['--introspect']);

    const parsed = JSON.parse(stdoutText());
    expect(parsed.tools).toHaveLength(4);
    expect(process.exitCode).toBe(0);
  });
});

describe('++ chaining', () => {
  it('threads a prior step JSON result into a later step via @{1.path}', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'square', '4', '++', 'calc', 'add', '@{1.result}', '10']
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.steps[0]).toEqual({
      noun: 'calc',
      verb: 'square',
      result: { operation: 'square', value: 4, result: 16 },
    });
    expect(parsed.steps[1]).toEqual({
      noun: 'calc',
      verb: 'add',
      result: { operation: 'addition', left: 16, right: 10, result: 26 },
    });
    expect(process.exitCode).toBe(0);
  });

  it('supports three or more chained steps', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'add', '2', '3', '++', 'calc', 'square', '@{1.result}', '++', 'calc', 'add', '@{2.result}', '1']
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed.steps).toHaveLength(3);
    // add(2,3)=5 -> square(5)=25 -> add(25,1)=26
    expect(parsed.steps[2].result).toEqual({ operation: 'addition', left: 25, right: 1, result: 26 });
  });

  it('stops the chain and reports a structured error when a step fails', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'divide', '10', '0', '++', 'calc', 'add', '@{1.result}', '1']
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.error).toEqual({ code: 'INVALID_INPUT', message: 'Division by zero is not allowed' });
    expect(process.exitCode).toBe(1);
  });

  it('reports a structured error for a chain reference to a step that has not run', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'add', '2', '3', '++', 'calc', 'add', '@{5.result}', '1']
    );

    const parsed = JSON.parse(stdoutText());
    // Step 2 only has step 1 available; step 5 does not exist yet.
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.error.code).toBe('INVALID_INPUT');
    expect(parsed.error.message).toContain('step 5');
  });
});

describe('resolveResultExitCode aborts a chain', () => {
  // Same stand-in as cli.test.ts: a resolved result whose payload marks it
  // as a failed outcome (a sum above 50) must abort a ++ chain the same way
  // a thrown error does — no subsequent step should run.
  const largeResultIsFailure = (result: unknown): number | undefined => {
    const r = result as { result?: number };
    return typeof r.result === 'number' && r.result > 50 ? 4 : undefined;
  };

  it('stops the chain when a step resolves to a nonzero exit code', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0', resolveResultExitCode: largeResultIsFailure },
      ['calc', 'add', '60', '50', '++', 'calc', 'add', '@{1.result}', '10']
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].result).toEqual({ operation: 'addition', left: 60, right: 50, result: 110 });
    expect(process.exitCode).toBe(4);
  });

  it('runs every step normally when no step resolves a nonzero exit code', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0', resolveResultExitCode: largeResultIsFailure },
      ['calc', 'add', '2', '3', '++', 'calc', 'add', '@{1.result}', '10']
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed.steps).toHaveLength(2);
    expect(process.exitCode).toBe(0);
  });
});

describe('@- stdin extraction', () => {
  it('substitutes @-::path with a field from piped JSON before dispatch', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'add', '@-::left', '10'],
      { readStdin: async () => JSON.stringify({ left: 5 }) }
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({ operation: 'addition', left: 5, right: 10, result: 15 });
  });

  it('substitutes a bare @- with the full stdin content', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'add', '@-', '10'],
      { readStdin: async () => '7' }
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({ operation: 'addition', left: 7, right: 10, result: 17 });
  });

  it('never calls the injected stdin reader when no arg references stdin', async () => {
    let called = false;
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'add', '2', '3'],
      { readStdin: async () => { called = true; return ''; } }
    );

    expect(called).toBe(false);
    expect(JSON.parse(stdoutText())).toEqual({ operation: 'addition', left: 2, right: 3, result: 5 });
  });

  it('produces a structured error envelope when stdin is not valid JSON for @-::path', async () => {
    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0' },
      ['calc', 'add', '@-::left', '10'],
      { readStdin: async () => 'not json' }
    );

    const parsed = JSON.parse(stdoutText());
    expect(parsed.error.code).toBe('INVALID_INPUT');
    expect(process.exitCode).toBe(1);
  });
});

describe('onResult/onError middleware hooks', () => {
  it('fires onResult with noun/verb/args/result/durationMs after a successful verb', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();

    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0', onResult, onError },
      ['calc', 'add', '2', '3']
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledTimes(1);
    const info = onResult.mock.calls[0][0];
    expect(info.noun).toBe('calc');
    expect(info.verb).toBe('add');
    expect(info.args).toMatchObject({ left: '2', right: '3' });
    expect(info.result).toEqual({ operation: 'addition', left: 2, right: 3, result: 5 });
    expect(typeof info.durationMs).toBe('number');
  });

  it('fires onError with noun/verb/args/error/durationMs after a failed verb', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();

    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0', onResult, onError },
      ['calc', 'divide', '10', '0']
    );

    expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const info = onError.mock.calls[0][0];
    expect(info.noun).toBe('calc');
    expect(info.verb).toBe('divide');
    expect(info.error.code).toBe('INVALID_INPUT');
    expect(info.error.message).toBe('Division by zero is not allowed');
    expect(typeof info.durationMs).toBe('number');
  });

  it('fires onResult/onError per step during ++ chaining', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();

    await runCli(
      [calcNoun],
      { name: 'calc-cli', version: '0.0.0', onResult, onError },
      ['calc', 'square', '4', '++', 'calc', 'divide', '@{1.result}', '0']
    );

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].verb).toBe('square');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].verb).toBe('divide');
  });

  it('does not fire onResult/onError for a pure --introspect invocation', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();

    await runCli([calcNoun], { name: 'calc-cli', version: '0.0.0', onResult, onError }, ['--introspect']);

    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
