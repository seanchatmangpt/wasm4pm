import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const verifyBoundaryEvidence = defineCommand({
  meta: {
    name: 'verify-boundary-evidence',
    description: 'Verifies that the boundary_evidence block exists and matches physical execution output',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'verify-boundary-evidence', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
