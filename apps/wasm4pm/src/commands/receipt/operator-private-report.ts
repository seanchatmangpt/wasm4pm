import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const operatorPrivateReport = defineCommand({
  meta: {
    name: 'operator-private-report',
    description: 'Generates the internal forensics report including raw hash comparisons',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'operator-private-report', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
