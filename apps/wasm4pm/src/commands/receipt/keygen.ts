import { defineCommand } from 'citty';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export const keygen = defineCommand({
  meta: {
    name: 'keygen',
    description: 'Generates an ed25519 key pair for receipt signing',
  },
  args: {
    dir: { type: 'string', default: '.wasm4pm/keys', description: 'Directory to write key files' },
  },
  async run(ctx) {
    const dir = ctx.args.dir as string;
    mkdirSync(dir, { recursive: true });

    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      publicKeyEncoding: { type: 'spki', format: 'der' },
    });

    const privPath = join(dir, 'signing.key');
    const pubPath = join(dir, 'signing.pub');

    writeFileSync(
      privPath,
      JSON.stringify({ algorithm: 'ed25519', key: (privateKey as Buffer).toString('hex') }, null, 2),
    );
    chmodSync(privPath, 0o600);

    writeFileSync(
      pubPath,
      JSON.stringify({ algorithm: 'ed25519', key: (publicKey as Buffer).toString('hex') }, null, 2),
    );

    console.log(`Private key: ${privPath}`);
    console.log(`Public key:  ${pubPath}`);
  },
});
