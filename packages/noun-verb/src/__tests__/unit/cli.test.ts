import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { buildCli } from '../../cli.js';
import { buildSpecimenCli, calcNoun } from '../specimen-calc.js';

// `ReturnType<typeof vi.spyOn>` resolves against the *generic, uninstantiated*
// overload of `vi.spyOn` (there's no call-site argument to infer from), which
// TS widens to `MockInstance<unknown[], unknown>` — incompatible with what
// `vi.spyOn(process.stdout, 'write')` actually returns
// (`MockInstance<Parameters<typeof process.stdout.write>, boolean>`). Naming
// the concrete signature here keeps both the declaration and the assignment
// in `beforeEach` in sync without a cast.
type WriteSpy = MockInstance<Parameters<typeof process.stdout.write>, ReturnType<typeof process.stdout.write>>;

let stdoutSpy: WriteSpy;
let stderrSpy: WriteSpy;

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

describe('noun-verb dispatch', () => {
  it('routes <noun> <verb> to the matching handler', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'add', '2', '3'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({ operation: 'addition', left: 2, right: 3, result: 5 });
    expect(process.exitCode).toBe(0);
  });

  it('dispatches a different verb under the same noun independently', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'multiply', '4', '2.5'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({ operation: 'multiplication', left: 4, right: 2.5, result: 10 });
  });
});

describe('JSON is the default stdout contract', () => {
  it('emits exactly one JSON-parseable value on stdout with no extra noise', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'divide', '10', '2'] });

    // Whole captured stdout must itself be valid JSON (no leading/trailing text).
    expect(() => JSON.parse(stdoutText())).not.toThrow();
    expect(stderrText()).toBe('');
  });

  it('never touches stdout for progress/banner text — experimental banner goes to stderr only', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'square', '4'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({ operation: 'square', value: 4, result: 16 });
    expect(stderrText()).toContain('[experimental]');
    expect(stderrText()).toContain('calc square');
  });
});

describe('--human', () => {
  it('additionally renders a human view to stderr while stdout stays pure JSON', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'add', '2', '3', '--human'] });

    // stdout is unaffected by --human: still exactly the JSON result.
    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({ operation: 'addition', left: 2, right: 3, result: 5 });

    // stderr carries the verb-supplied human renderer's output.
    expect(stderrText()).toContain('2 + 3 = 5');
  });

  it('falls back to a generic key: value rendering when no human renderer is supplied', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'multiply', '4', '2', '--human'] });

    expect(stderrText()).toContain('operation: multiplication');
    expect(stderrText()).toContain('result: 8');
  });

  it('omits human rendering entirely when --human is not passed', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'add', '2', '3'] });

    expect(stderrText()).toBe('');
  });
});

describe('structured errors', () => {
  it('produces the { error: { code, message } } envelope on stdout for a thrown NounVerbError', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'divide', '10', '0'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed).toEqual({
      error: {
        code: 'INVALID_INPUT',
        message: 'Division by zero is not allowed',
      },
    });
  });

  it('maps INVALID_INPUT to the default exit code', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'divide', '10', '0'] });

    expect(process.exitCode).toBe(1);
  });

  it('lets a host CLI override the exit-code mapping via errorCodeMap', async () => {
    const cli = buildSpecimenCli({ INVALID_INPUT: 2 });
    await runCommand(cli, { rawArgs: ['calc', 'divide', '10', '0'] });

    expect(process.exitCode).toBe(2);
    // Envelope shape is unaffected by exit-code overrides.
    const parsed = JSON.parse(stdoutText());
    expect(parsed.error.code).toBe('INVALID_INPUT');
  });

  it('rejects a non-numeric operand with a structured error rather than throwing raw', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'add', 'not-a-number', '3'] });

    const parsed = JSON.parse(stdoutText());
    expect(parsed.error.code).toBe('INVALID_INPUT');
    expect(parsed.error.message).toContain("'left' must be a number");
    expect(process.exitCode).toBe(1);
  });

  it('also renders the error on stderr when --human is passed', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'divide', '10', '0', '--human'] });

    expect(stderrText()).toContain('Error [INVALID_INPUT]');
    expect(stderrText()).toContain('Division by zero is not allowed');
  });
});

describe('resolveResultExitCode', () => {
  // A resolved (non-throwing) result can still represent a failed outcome —
  // the fail-closed concern this option exists for (e.g. `model check`
  // returning a REJECTED verdict as a normal return value). A sum above 50
  // stands in for such a result here (avoiding negative-number operands,
  // which citty's own arg parser treats as flags rather than positionals).
  const largeResultIsFailure = (result: unknown): number | undefined => {
    const r = result as { result?: number };
    return typeof r.result === 'number' && r.result > 50 ? 3 : undefined;
  };

  it("uses the resolver's returned exit code for a resolved result", async () => {
    const cli = buildCli([calcNoun], {
      name: 'calc-cli',
      version: '0.0.0',
      resolveResultExitCode: largeResultIsFailure,
    });
    await runCommand(cli, { rawArgs: ['calc', 'add', '60', '50'] });

    expect(process.exitCode).toBe(3);
    // The envelope on stdout is unaffected — only the exit code changes.
    expect(JSON.parse(stdoutText())).toEqual({ operation: 'addition', left: 60, right: 50, result: 110 });
  });

  it('defaults to exit code 0 when the resolver returns undefined for this result', async () => {
    const cli = buildCli([calcNoun], {
      name: 'calc-cli',
      version: '0.0.0',
      resolveResultExitCode: largeResultIsFailure,
    });
    await runCommand(cli, { rawArgs: ['calc', 'add', '2', '3'] });

    expect(process.exitCode).toBe(0);
  });

  it('defaults to exit code 0 when no resolver is supplied at all', async () => {
    const cli = buildSpecimenCli();
    await runCommand(cli, { rawArgs: ['calc', 'add', '2', '3'] });

    expect(process.exitCode).toBe(0);
  });
});
