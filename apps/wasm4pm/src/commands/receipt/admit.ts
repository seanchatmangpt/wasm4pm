import { defineCommand } from 'citty';
import { readFileSync } from 'node:fs';
import { WasmLoader } from '@wasm4pm/engine';
import type { AdmissionResult } from '@wasm4pm/contracts';

const DEFAULT_NONCE_LEDGER_PATH = '.wasm4pm/nonce-ledger.jsonl';
const DEFAULT_POLICY_PATH = '.wasm4pm/admission-policy.json';
const DEFAULT_BOUNDARY_MAP_PATH = '.wasm4pm/boundary-map.json';
const DEFAULT_REVOCATION_PATH = '.wasm4pm/revoked-validators.json';

export const admit = defineCommand({
  meta: {
    name: 'admit',
    description: 'Runs the admissibility framework against a candidate receipt',
  },
  args: {
    candidate: { type: 'positional', description: 'Path to candidate JSON file', required: true },
    ledger: { type: 'string', default: DEFAULT_NONCE_LEDGER_PATH, description: 'Nonce ledger path' },
    policy: { type: 'string', default: DEFAULT_POLICY_PATH, description: 'Admission policy path' },
    'boundary-map': {
      type: 'string',
      default: DEFAULT_BOUNDARY_MAP_PATH,
      description: 'Boundary map path',
    },
    revocation: {
      type: 'string',
      default: DEFAULT_REVOCATION_PATH,
      description: 'Revocation list path',
    },
    json: { type: 'boolean', default: false, description: 'Machine-readable JSON output' },
  },
  async run(ctx) {
    const candidatePath = ctx.args.candidate as string;
    const ledgerPath = ctx.args.ledger as string;
    const policyPath = ctx.args.policy as string;
    const boundaryMap = ctx.args['boundary-map'] as string;
    const revocationPath = ctx.args.revocation as string;
    const jsonOutput = ctx.args.json as boolean;

    const candidateRaw = readFileSync(candidatePath, 'utf-8');

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get();

    const resultRaw = (wasm.wasm_admit_change as (...args: string[]) => string)(
      candidateRaw,
      ledgerPath,
      policyPath,
      boundaryMap,
      revocationPath,
    );

    const result: AdmissionResult = JSON.parse(resultRaw);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.admitted) {
      console.log(`ADMITTED  receipt_hash=${result.receipt_hash ?? 'n/a'}`);
    } else {
      console.log(
        `REFUSED  conjunct=${result.failing_conjunct ?? 'unknown'}  code=${result.refusal_code ?? 'unknown'}`,
      );
    }

    if (!result.admitted) {
      process.exit(1);
    }
  },
});
