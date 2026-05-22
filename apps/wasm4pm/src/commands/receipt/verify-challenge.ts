import { defineCommand } from 'citty';
import { execSync } from 'child_process';

export const verifyChallenge = defineCommand({
  meta: {
    name: 'verify-challenge',
    description: 'Checks that the challenge nonce exists and is cryptographically bound',
  },
  args: {
    file: { type: 'positional', description: 'Path to receipt JSON file', required: true },
  },
  async run(ctx) {
    const filepath = ctx.args.file as string;
    try {
       const args = ['run', '--bin', 'wpm', '--quiet', '--', 'receipt', 'verify-challenge', filepath];
       execSync('cargo ' + args.join(' '), { stdio: 'inherit' });
       process.exit(0);
    } catch (err: any) {
       process.exit(err.status ?? 1);
    }
  }
});
