import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const canonicalizeOcel2 = defineCommand({
  meta: {
    name: 'canonicalize-ocel2',
    description: 'Outputs the canonicalized, sorted, and minified representation of the embedded OCEL logs',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'canonicalize-ocel2', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
