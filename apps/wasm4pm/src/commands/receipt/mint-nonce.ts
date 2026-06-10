import { defineCommand } from 'citty';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const mintNonce = defineCommand({
  meta: {
    name: 'mint-nonce',
    description: 'Generates a fresh challenge nonce and writes a pending manifest',
  },
  args: {
    dir: {
      type: 'string',
      default: '.wasm4pm/nonces/pending',
      description: 'Directory to write pending nonce manifests',
    },
  },
  async run(ctx) {
    const dir = ctx.args.dir as string;
    mkdirSync(dir, { recursive: true });

    const nonce = randomBytes(16).toString('hex');
    const manifest = {
      nonce,
      minted_at: new Date().toISOString(),
      status: 'pending',
    };

    const outPath = join(dir, `${nonce}.json`);
    writeFileSync(outPath, JSON.stringify(manifest, null, 2));

    // Print nonce to stdout for scripting
    process.stdout.write(nonce + '\n');
  },
});
