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
    const meta = doctor.meta as any;
    const args = doctor.args as any;
    const subs = doctor.subCommands as any;
    
    expect(meta?.name).toBe('doctor');
    expect(meta?.description).toContain('health');
    expect(args).toBeDefined();
    // doctor uses citty's subCommands pattern; citty dispatches to a matching
    // subcommand (check/fix/publish/env/tps/perf/watch/report) or prints help.
    expect(subs).toBeDefined();
    expect(subs?.check).toBeDefined();
  });

  it('accepts --format, --verbose, and --quiet flags with correct types and aliases', () => {
    const args = doctor.args as any;
    expect(args?.format?.type).toBe('string');
    expect(args?.format?.default).toBe('human');
    expect(args?.verbose?.type).toBe('boolean');
    expect(args?.verbose?.alias).toBe('v');
    expect(args?.quiet?.type).toBe('boolean');
    expect(args?.quiet?.alias).toBe('q');
  });

  it('requires zero positional arguments', () => {
    const args = doctor.args as any;
    const positionals = Object.values(args ?? {}).filter(
      (a: any) => a && typeof a === 'object' && 'type' in a && a.type === 'positional'
    );
    expect(positionals).toHaveLength(0);
  });
});
