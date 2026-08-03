import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildPlan } from '../plan.js';
import { executePlan } from '../execute.js';
import { loadPipelineBundle, verifyPipelineBundle } from '../bundle.js';

const originalCwd = process.cwd();
const roots: string[] = [];

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-pipeline-proof-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'input.xes'), '<log/>');
  process.chdir(root);
  return root;
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('proof-carrying pipeline capsule', () => {
  it('manufactures deterministic plan identity from semantic inputs', async () => {
    fixtureRoot();
    const first = await buildPlan({ auto: true, input: 'input.xes' });
    const second = await buildPlan({ auto: true, input: 'input.xes' });

    expect(first.planHash).toBe(second.planHash);
    expect(first.planId).toBe(second.planId);
    expect(first.planId).toBe(`plan-${first.planHash.slice(0, 24)}`);
  });

  it('writes a verified partial checkpoint and resumes only the failed suffix', async () => {
    fixtureRoot();
    const plan = await buildPlan({ auto: true, input: 'input.xes' });
    let validateCalls = 0;
    let discoverCalls = 0;

    const failed = await executePlan(plan, async (noun, verb, args) => {
      if (noun === 'log' && verb === 'validate') {
        validateCalls += 1;
        return { valid: true, input: args.input };
      }
      discoverCalls += 1;
      throw new Error('simulated discovery outage');
    });

    expect(failed.status).toBe('partial');
    expect(failed.standing).toBe('PARTIAL_ALIVE');
    expect(failed.steps).toHaveLength(2);
    const checkpoint = loadPipelineBundle(failed.bundlePath);
    expect(() => verifyPipelineBundle(checkpoint)).not.toThrow();

    const resumed = await executePlan(
      plan,
      async (noun, verb, args) => {
        if (noun === 'log' && verb === 'validate') {
          validateCalls += 1;
          return { valid: true };
        }
        discoverCalls += 1;
        return { algorithm: 'heuristic_miner', handle: `model:${String(args.input)}` };
      },
      { resumeFrom: checkpoint, bundlePath: failed.bundlePath }
    );

    expect(resumed.status).toBe('ok');
    expect(resumed.standing).toBe('ALIVE');
    expect(validateCalls).toBe(1);
    expect(discoverCalls).toBe(2);
    expect(() => verifyPipelineBundle(loadPipelineBundle(resumed.bundlePath))).not.toThrow();
  });

  it('rejects tampering with any step identity or evidence hash', async () => {
    fixtureRoot();
    const plan = await buildPlan({ auto: true, input: 'input.xes' });
    const report = await executePlan(plan, async (_noun, verb) => ({ verb, ok: true }));
    const tampered = JSON.parse(fs.readFileSync(report.bundlePath, 'utf-8')) as ReturnType<typeof loadPipelineBundle>;
    (tampered.steps[0] as { argsHash: string }).argsHash = '0'.repeat(64);

    expect(() => verifyPipelineBundle(tampered)).toThrow(/Output hash mismatch/);
  });

  it('resolves references recursively inside nested plan arguments', async () => {
    const root = fixtureRoot();
    const planPath = path.join(root, 'plan.json');
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        steps: [
          { id: 'one', noun: 'demo', verb: 'produce', args: {} },
          {
            id: 'two',
            noun: 'demo',
            verb: 'consume',
            args: { nested: { handle: '@{one.value.handle}' } },
            dependsOn: ['one'],
          },
        ],
      })
    );
    const plan = await buildPlan({ planFile: planPath });
    let observed = '';

    const report = await executePlan(plan, async (_noun, verb, args) => {
      if (verb === 'produce') return { value: { handle: 'abc' } };
      observed = String((args.nested as { handle: string }).handle);
      return { ok: true };
    });

    expect(report.status).toBe('ok');
    expect(observed).toBe('abc');
  });

  it('refuses duplicate step identities before any execution', async () => {
    const root = fixtureRoot();
    const planPath = path.join(root, 'duplicate.json');
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        steps: [
          { id: 'same', noun: 'demo', verb: 'one' },
          { id: 'same', noun: 'demo', verb: 'two' },
        ],
      })
    );

    await expect(buildPlan({ planFile: planPath })).rejects.toThrow("Duplicate pipeline step id 'same'");
  });
});
