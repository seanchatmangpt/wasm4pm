import { defineCommand } from 'citty';
import { execSync } from 'child_process';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Audits a candidate receipt against all Adversarial Ingress Gates',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
    strict: { type: 'boolean', description: 'Terminate with exit code 1 if any finding is identified' },
    format: { type: 'string', default: 'human', description: 'Output format' },
    audience: { type: 'string', default: 'operator', description: 'producer or operator' },
  },
  async run(ctx) { console.log("Running doctor JS...");
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'doctor', filepath, '--audience', ctx.args.audience as string];
       if (ctx.args.strict) args.push('--strict');
       
       if (format === 'json') args.push('--format', 'json');

       execSync(`cargo ${args.join(' ')}`, { stdio: 'inherit' });

       // If it didn't throw, it exited 0
       process.exit(0);
    } catch (err: any) {
       // Cargo run throws if it exits non-zero
       process.exit(err.status ?? 1);
    }
  }
});