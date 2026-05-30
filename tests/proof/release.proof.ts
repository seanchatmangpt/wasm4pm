import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from '@wasm4pm/config';

/**
 * PROOF: CLI boots, version resolves, config loads.
 *
 * INVARIANT — a fresh resolveConfig() must produce a Zod-validated Config whose
 * required sections are present, and a SemVer version string must be resolvable
 * from the published package.json (no CLI binary spawn).
 *
 * Grounded in real exports:
 *  - @wasm4pm/config → resolveConfig() (packages/config/src/resolver.ts:24, async)
 *  - configSchema sections: source/sink/algorithm/execution/output (schema.ts:635-645)
 *  - version: apps/wasm4pm/package.json "version" (cli.ts reads pkg.version)
 *
 * Anti-FM-5: assert presence/shape of sections and SemVer pattern — NOT specific
 * derived values from the resolver implementation.
 */
describe('release.proof — CLI boots, version resolves, config loads', () => {
  it('resolveConfig() returns a Config with required Zod sections', async () => {
    const config = await resolveConfig();
    expect(config).toBeTypeOf('object');
    expect(config).not.toBeNull();

    // Required sections per packages/config/src/schema.ts configSchema (lines 639-645)
    expect(config).toHaveProperty('algorithm');
    expect(config).toHaveProperty('execution');
    expect(config).toHaveProperty('output');
    expect(config).toHaveProperty('source');
    expect(config).toHaveProperty('sink');

    expect(config.algorithm).toBeTypeOf('object');
    expect(config.execution).toBeTypeOf('object');
    expect(config.output).toBeTypeOf('object');

    // algorithm.name must be a non-empty string (default 'dfg')
    expect(typeof config.algorithm.name).toBe('string');
    expect(config.algorithm.name.length).toBeGreaterThan(0);
  });

  it('a SemVer version string resolves from the published package metadata', () => {
    // Read the app package.json directly (no CLI spawn, no JSON import assertion).
    const pkgPath = fileURLToPath(
      new URL('../../apps/wasm4pm/package.json', import.meta.url)
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toMatch(/\d+\.\d+\.\d+/);
  });
});
