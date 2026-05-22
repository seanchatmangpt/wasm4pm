import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const verifyProofClass = defineCommand({
  meta: {
    name: 'verify-proof-class',
    description: 'Validates that the declared proof_class corresponds to the level of evidence supplied',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'verify-proof-class', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
