import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const producerSafeReport = defineCommand({
  meta: {
    name: 'producer-safe-report',
    description: 'Generates a sanitized report for external integration',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'producer-safe-report', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
