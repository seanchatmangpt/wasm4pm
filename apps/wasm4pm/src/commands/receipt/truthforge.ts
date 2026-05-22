import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const truthforge = defineCommand({
  meta: {
    name: 'truthforge',
    description: 'Run adversarial mutator test suite',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'truthforge', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
