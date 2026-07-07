/**
 * wpm evidence keygen — migrated from `commands/receipt/keygen.ts`.
 * Generates an ed25519 key pair for receipt signing.
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { defineVerb } from '@wasm4pm/noun-verb';

export const keygenVerb = defineVerb({
  noun: 'evidence',
  verb: 'keygen',
  summary: 'Generate an ed25519 key pair for receipt signing (was: wpm receipt keygen)',
  args: {
    dir: { type: 'string', default: '.wasm4pm/keys', description: 'Directory to write key files' },
  } as const,
  handler: async (args) => {
    const dir = (args.dir as string) ?? '.wasm4pm/keys';
    mkdirSync(dir, { recursive: true });

    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      publicKeyEncoding: { type: 'spki', format: 'der' },
    });

    const privPath = join(dir, 'signing.key');
    const pubPath = join(dir, 'signing.pub');

    writeFileSync(privPath, JSON.stringify({ algorithm: 'ed25519', key: (privateKey as Buffer).toString('hex') }, null, 2));
    chmodSync(privPath, 0o600);
    writeFileSync(pubPath, JSON.stringify({ algorithm: 'ed25519', key: (publicKey as Buffer).toString('hex') }, null, 2));

    return { privateKeyPath: privPath, publicKeyPath: pubPath };
  },
});
