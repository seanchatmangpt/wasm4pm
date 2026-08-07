/**
 * Structural OTEL span coverage tests for wasm4pm CLI commands.
 *
 * Oracle hierarchy:
 *   Rank 1 — Mathematical: span names emitted by `withSpan(name, ...)` are
 *             always `wasm4pm.command.<name>`, a fixed string-concatenation
 *             theorem derivable from _otel.ts without running any code.
 *   Rank 2 — Domain contract: every leaf command handler must have a
 *             top-level span wrapper so no execution escapes observability.
 *   Rank 3 — Metamorphic: same source structure → same span name (no runtime
 *             randomness can affect the static import/call presence).
 *
 * These are structural (static-analysis) tests. They read the source files
 * directly, so they never depend on WASM availability or network state.
 * They are fast (<10 ms), deterministic, and fail loudly if a contributor
 * removes span instrumentation.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Resolve the commands directory relative to this test file.
// packages/observability/src/__tests__/ → ../../../../apps/wasm4pm/src/commands/
const COMMANDS_DIR = path.resolve(
  __dirname,
  '../../../../apps/wasm4pm/src/commands'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readCommand(name: string): string {
  return fs.readFileSync(path.join(COMMANDS_DIR, `${name}.ts`), 'utf-8');
}

/**
 * Extract all span names from `withSpan('name', ...)` call sites.
 * `withSpan` auto-prefixes with `wasm4pm.command.`, so the source argument
 * is the bare command name (e.g. `'social'`).
 */
function extractWithSpanNames(source: string): string[] {
  const re = /withSpan\s*\(\s*['"]([^'"]+)['"]/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    names.push(`wasm4pm.command.${m[1]}`);
  }
  return names;
}

/**
 * Extract all span names from `withSpanRaw('full.name', ...)` call sites.
 * `withSpanRaw` takes the full name as-is.
 */
function extractWithSpanRawNames(source: string): string[] {
  const re = /withSpanRaw\s*\(\s*['"]([^'"]+)['"]/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Commands under test
// ---------------------------------------------------------------------------

/**
 * Leaf command files that own a `run()` handler and must have span coverage.
 * Router/dispatcher files (agent.ts, cognition.ts) are excluded — their child
 * handlers in agent/ and cognition/ subdirectories carry the spans.
 */
const LEAF_COMMANDS = [
  'social',
  'autoprocess',
  'simulate',
  'temporal',
] as const;

// ---------------------------------------------------------------------------
// Suite 1 — Presence: every leaf command imports and calls a span wrapper
// ---------------------------------------------------------------------------

describe('Command OTEL span coverage — presence', () => {
  for (const cmd of LEAF_COMMANDS) {
    it(`${cmd}.ts imports withSpan or withSpanRaw from _otel`, () => {
      const src = readCommand(cmd);
      expect(src).toMatch(/import\s*\{[^}]*withSpan[^}]*\}\s*from\s*['"]\.\/(_otel|_otel\.js)['"]/);
    });

    it(`${cmd}.ts calls withSpan or withSpanRaw at least once`, () => {
      const src = readCommand(cmd);
      expect(src).toMatch(/withSpan(?:Raw)?\s*\(/);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2 — Naming: spans produced by withSpan follow wasm4pm.command.* format
// ---------------------------------------------------------------------------

describe('Command OTEL span coverage — naming convention', () => {
  it('withSpan() calls produce names with wasm4pm.command.* prefix (Rank-1 theorem)', () => {
    for (const cmd of LEAF_COMMANDS) {
      const src = readCommand(cmd);
      const names = extractWithSpanNames(src);
      // Every command that uses withSpan must produce at least one conforming name
      for (const name of names) {
        expect(name, `span in ${cmd}.ts: '${name}'`).toMatch(/^wasm4pm\.command\./);
      }
    }
  });

  it('withSpanRaw() calls use wasm4pm.* prefix (child spans must stay in namespace)', () => {
    for (const cmd of LEAF_COMMANDS) {
      const src = readCommand(cmd);
      const names = extractWithSpanRawNames(src);
      for (const name of names) {
        expect(name, `raw span in ${cmd}.ts: '${name}'`).toMatch(/^wasm4pm\./);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Content: top-level handler span matches the command name
// ---------------------------------------------------------------------------

describe('Command OTEL span coverage — top-level handler span', () => {
  // `withSpan('social', ...)` → emitted name is `wasm4pm.command.social`
  const expectedTopLevel: Record<string, string> = {
    social: 'wasm4pm.command.social',
    autoprocess: 'wasm4pm.command.autoprocess',
    simulate: 'wasm4pm.command.simulate',
    temporal: 'wasm4pm.command.temporal',
  };

  for (const cmd of LEAF_COMMANDS) {
    it(`${cmd}.ts top-level span is ${expectedTopLevel[cmd]}`, () => {
      const src = readCommand(cmd);
      const names = extractWithSpanNames(src);
      expect(names, `${cmd}.ts must have at least one withSpan() call`).not.toHaveLength(0);
      expect(names).toContain(expectedTopLevel[cmd]);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 4 — Structural integrity of _otel.ts itself
// ---------------------------------------------------------------------------

describe('_otel.ts span wrapper integrity', () => {
  it('exports both withSpan and withSpanRaw', () => {
    const src = fs.readFileSync(path.join(COMMANDS_DIR, '_otel.ts'), 'utf-8');
    expect(src).toMatch(/export\s+async\s+function\s+withSpan\b/);
    expect(src).toMatch(/export\s+async\s+function\s+withSpanRaw\b/);
  });

  it('withSpan prepends wasm4pm.command. to the name (Rank-1 source theorem)', () => {
    const src = fs.readFileSync(path.join(COMMANDS_DIR, '_otel.ts'), 'utf-8');
    // The implementation must contain the prefix concatenation
    expect(src).toMatch(/`wasm4pm\.command\.\$\{name\}`/);
  });

  it('withSpanRaw uses fullName directly (no prefix)', () => {
    const src = fs.readFileSync(path.join(COMMANDS_DIR, '_otel.ts'), 'utf-8');
    // withSpanRaw sets span.name = fullName — the parameter, not a concatenation
    expect(src).toMatch(/name:\s*fullName/);
  });

  it('both wrappers emit to the global span sink', () => {
    const src = fs.readFileSync(path.join(COMMANDS_DIR, '_otel.ts'), 'utf-8');
    expect(src).toMatch(/getGlobalSpanSink/);
  });

  it('both wrappers include service.name = wasm4pm attribute', () => {
    const src = fs.readFileSync(path.join(COMMANDS_DIR, '_otel.ts'), 'utf-8');
    expect(src).toMatch(/'service\.name':\s*'wasm4pm'/);
  });
});
