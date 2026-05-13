/**
 * Tests for `wpm doctor` — zero-argument environment health check.
 *
 * Chicago TDD: tests command metadata (shape, args, meta) which is
 * observable behavior. Removed re-implemented logic sections that
 * just duplicated what the source already does.
 */

import { describe, it, expect } from 'vitest';
import { doctor } from '../src/cli.js';

describe('doctor command — shape', () => {
  it('is a valid citty command with meta, args, and subCommands', () => {
    expect(doctor.meta?.name).toBe('doctor');
    expect(doctor.meta?.description).toContain('health');
    expect(doctor.args).toBeDefined();
    // doctor uses citty's subCommands pattern; citty dispatches to a matching
    // subcommand (check/fix/publish/env/tps/perf/watch/report) or prints help.
    expect(doctor.subCommands).toBeDefined();
    expect(doctor.subCommands?.check).toBeDefined();
  });

  it('accepts --format, --verbose, and --quiet flags with correct types and aliases', () => {
    expect(doctor.args?.format?.type).toBe('string');
    expect(doctor.args?.format?.default).toBe('human');
    expect(doctor.args?.verbose?.type).toBe('boolean');
    expect(doctor.args?.verbose?.alias).toBe('v');
    expect(doctor.args?.quiet?.type).toBe('boolean');
    expect(doctor.args?.quiet?.alias).toBe('q');
  });

  it('requires zero positional arguments', () => {
    const positionals = Object.values(doctor.args ?? {}).filter(
      (a) => a && typeof a === 'object' && 'type' in a && a.type === 'positional'
    );
    expect(positionals).toHaveLength(0);
  });
});
