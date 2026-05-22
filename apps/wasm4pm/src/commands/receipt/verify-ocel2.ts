import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const verifyOcel2 = defineCommand({
  meta: {
    name: 'verify-ocel2',
    description: 'Validates that the embedded expected and observed OCEL 2.0 logs are structurally valid',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'verify-ocel2', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
