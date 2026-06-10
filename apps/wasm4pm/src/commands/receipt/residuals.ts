import { defineCommand } from 'citty';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface ResidualEntry {
  candidate_hash?: string;
  failing_conjunct?: string;
  refusal_code?: string;
  [key: string]: unknown;
}

const listResiduals = defineCommand({
  meta: {
    name: 'list',
    description: 'Lists all residual refusal records',
  },
  args: {
    dir: {
      type: 'string',
      default: '.wasm4pm/residuals',
      description: 'Directory containing residual JSON files',
    },
    json: { type: 'boolean', default: false, description: 'Machine-readable JSON output' },
  },
  async run(ctx) {
    const dir = ctx.args.dir as string;
    const jsonOutput = ctx.args.json as boolean;

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const entries: ResidualEntry[] = files.map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ResidualEntry;
      } catch {
        return { candidate_hash: f.replace('.json', ''), failing_conjunct: 'parse_error', refusal_code: 'PARSE_ERROR' };
      }
    });

    if (jsonOutput) {
      console.log(JSON.stringify(entries, null, 2));
    } else if (entries.length === 0) {
      console.log('No residuals found.');
    } else {
      for (const entry of entries) {
        const hash = (entry.candidate_hash ?? '').slice(0, 12).padEnd(12);
        const conjunct = (entry.failing_conjunct ?? 'unknown').padEnd(20);
        const code = entry.refusal_code ?? 'unknown';
        console.log(`${hash}  ${conjunct}  ${code}`);
      }
    }
  },
});

export const residuals = defineCommand({
  meta: {
    name: 'residuals',
    description: 'Manages residual refusal records from the admissibility framework',
  },
  subCommands: {
    list: listResiduals,
  },
});
