import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const detectFixtureMutation = defineCommand({
  meta: {
    name: 'detect-fixture-mutation',
    description: 'Runs the structural similarity index engine and temporal variance analysis',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'detect-fixture-mutation', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
