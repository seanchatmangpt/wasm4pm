import { createHash } from 'blake3';

const data = 'wasm4pm blake3 verification';
const hash = createHash().update(data).digest('hex');
console.log(`Data: ${data}`);
console.log(`Hash: ${hash}`);

if (hash.length === 64) {
  console.log('Verification: Hash length is 64 characters (hex).');
} else {
  console.error(`Verification FAILED: Expected hash length 64, got ${hash.length}`);
  process.exit(1);
}

const expectedHash = createHash().update(data).digest('hex');
if (hash === expectedHash) {
  console.log('Verification: Hash is deterministic.');
} else {
  console.error('Verification FAILED: Hash is NOT deterministic.');
  process.exit(1);
}
