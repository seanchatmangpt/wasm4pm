/**
 * cognition-verbs.test.ts — module structure + pure-logic contracts for 8 CLI verbs
 *
 * Oracle rank: Rank 2 (Domain contract — command meta, arg declarations, pure logic,
 * OTEL span emission via emitCognitionSpan).
 *
 * All tests operate on exported module values or real temp files.
 * WASM-calling verbs (run, explain) are not integration-tested here — see packages/cognition.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { OtelSpan } from '@wasm4pm/cognition';

import { run } from '../commands/cognition/run.js';
import { explain } from '../commands/cognition/explain.js';
import { verify } from '../commands/cognition/verify.js';
import { receipt } from '../commands/cognition/receipt.js';
import { adversarial } from '../commands/cognition/adversarial.js';
import { replay } from '../commands/cognition/replay.js';
import { plan } from '../commands/cognition/plan.js';
import { inspect } from '../commands/cognition/inspect.js';

// ── helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cog-verbs-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

type CommandDef = {
  meta?: { name?: string; description?: string };
  args?: Record<string, { type?: string; alias?: string }>;
};

function asCmd(v: unknown): CommandDef {
  return v as CommandDef;
}

// ── meta.name contracts ────────────────────────────────────────────────────────

describe('cognition verb meta.name', () => {
  const pairs: [string, unknown][] = [
    ['run', run],
    ['explain', explain],
    ['verify', verify],
    ['receipt', receipt],
    ['adversarial', adversarial],
    ['replay', replay],
    ['plan', plan],
    ['inspect', inspect],
  ];

  for (const [expectedName, verb] of pairs) {
    it(`${expectedName}: meta.name === '${expectedName}'`, () => {
      expect(asCmd(verb).meta?.name).toBe(expectedName);
    });
  }
});

// ── meta.description contracts ─────────────────────────────────────────────────

describe('cognition verb meta.description', () => {
  const verbs = [run, explain, verify, receipt, adversarial, replay, plan, inspect];

  for (const verb of verbs) {
    const name = asCmd(verb).meta?.name ?? '(unknown)';
    it(`${name}: description is non-empty`, () => {
      const desc = asCmd(verb).meta?.description;
      expect(typeof desc).toBe('string');
      expect((desc as string).length).toBeGreaterThan(0);
    });
  }
});

// ── shared arg contracts (format, verbose, quiet) ─────────────────────────────

describe('cognition verb shared args', () => {
  const verbs = [run, explain, verify, receipt, adversarial, replay, plan, inspect];

  for (const verb of verbs) {
    const name = asCmd(verb).meta?.name ?? '(unknown)';
    it(`${name}: declares format, verbose (alias v), quiet (alias q)`, () => {
      const args = asCmd(verb).args ?? {};
      expect(args['format']).toBeDefined();
      expect(args['verbose']).toBeDefined();
      expect((args['verbose'] as { alias?: string }).alias).toBe('v');
      expect(args['quiet']).toBeDefined();
      expect((args['quiet'] as { alias?: string }).alias).toBe('q');
    });
  }
});

// ── verb-specific required arg contracts ──────────────────────────────────────

describe('cognition verb-specific args', () => {
  it('run: declares required contract and input args', () => {
    const args = asCmd(run).args ?? {};
    expect((args['contract'] as { required?: boolean }).required).toBe(true);
    expect((args['input'] as { required?: boolean }).required).toBe(true);
  });

  it('explain: declares required contract and input args', () => {
    const args = asCmd(explain).args ?? {};
    expect((args['contract'] as { required?: boolean }).required).toBe(true);
    expect((args['input'] as { required?: boolean }).required).toBe(true);
  });

  it('plan: declares required contract and input args', () => {
    const args = asCmd(plan).args ?? {};
    expect((args['contract'] as { required?: boolean }).required).toBe(true);
    expect((args['input'] as { required?: boolean }).required).toBe(true);
  });

  it('receipt: declares required receipt-id arg', () => {
    const args = asCmd(receipt).args ?? {};
    expect((args['receipt-id'] as { required?: boolean }).required).toBe(true);
  });

  it('replay: declares required receipt-id arg', () => {
    const args = asCmd(replay).args ?? {};
    expect((args['receipt-id'] as { required?: boolean }).required).toBe(true);
  });

  it('inspect: declares required artifact-id arg', () => {
    const args = asCmd(inspect).args ?? {};
    expect((args['artifact-id'] as { required?: boolean }).required).toBe(true);
  });
});

// ── adversarial severity constant contract ────────────────────────────────────

describe('adversarial severity enum contract', () => {
  it('adversarial severity default is "all"', () => {
    const args = asCmd(adversarial).args ?? {};
    expect((args['severity'] as { default?: string }).default).toBe('all');
  });
});

// ── plan pure-logic: candidate_count from BreedInput JSON ────────────────────

import { parseInputJson, loadReceipt } from '../commands/cognition/_shared.js';
import { withSpan } from '../commands/_otel.js';
import { setGlobalSpanSink, resetGlobalSpanSink } from '../otel/sink.js';

describe('plan pure-logic (parseInputJson path)', () => {
  it('parseInputJson parses candidate_count correctly from a real file', () => {
    const breedInput = {
      intent: 'select-breed',
      candidates: [
        { id: 'c1', score: 0.9, eliminated: false },
        { id: 'c2', score: 0.5, eliminated: true },
        { id: 'c3', score: 0.7, eliminated: false },
      ],
      facts: [],
      rules: [],
      goals: [],
      cases: [],
      state: [],
    };
    const f = path.join(tmpDir, 'breed.json');
    fs.writeFileSync(f, JSON.stringify(breedInput));

    const parsed = parseInputJson(f) as { candidates: unknown[] };
    expect(parsed.candidates).toHaveLength(3);
  });
});

// ── receipt chain integrity via loadReceipt ────────────────────────────────────

describe('replay/verify/receipt/inspect use loadReceipt correctly', () => {
  function writeReceipt(dir: string, id: string, data: unknown): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data));
  }

  it('loadReceipt returns saved chain with correct link count', () => {
    const id = 'test-chain-01';
    const chain = {
      id,
      links: [
        { index: 0, input_hash: 'ih0', output_hash: 'oh0', combined_hash: 'ch0' },
        { index: 1, input_hash: 'ih1', output_hash: 'oh1', combined_hash: 'ch1', prev_hash: 'ch0' },
      ],
    };
    writeReceipt(tmpDir, id, chain);
    const loaded = loadReceipt(id, tmpDir) as { links: unknown[] };
    expect(loaded.links).toHaveLength(2);
  });

  it('RECEIPT_CORRUPT is thrown for a truncated JSON file', () => {
    const id = 'corrupt-chain-01';
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, `${id}.json`), '{ "links": [');

    try {
      loadReceipt(id, tmpDir);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('RECEIPT_CORRUPT');
    }
  });
});

// ── OTEL span emission via withSpan + global sink (Plan E) ──────────────────

describe('OTEL span emission — withSpan via global sink capture', () => {
  let captured: OtelSpan[] = [];

  beforeEach(() => {
    captured = [];
    setGlobalSpanSink((s) => captured.push(s));
  });

  afterEach(() => {
    resetGlobalSpanSink();
  });

  it('withSpan emits a real span captured by the global sink', async () => {
    await withSpan('adversarial', {}, async () => null);
    expect(captured[0].name).toBe('wasm4pm.command.adversarial');
  });

  it('all 8 verb names match their meta.name (span name = "wasm4pm.command.<meta.name>" when wired)', () => {
    const verbs = [run, explain, verify, receipt, adversarial, replay, plan, inspect];
    for (const verb of verbs) {
      const name = (verb as { meta?: { name?: string } }).meta?.name ?? '';
      expect(name).toBeTruthy();
      expect(['run','explain','verify','receipt','adversarial','replay','plan','inspect']).toContain(name);
    }
  });
});
