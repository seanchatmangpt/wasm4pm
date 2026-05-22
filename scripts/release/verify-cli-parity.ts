import { getRegistry } from '../../packages/kernel/src/registry.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * scripts/release/verify-cli-parity.ts
 *
 * Checks that every algorithm in the registry is reachable via the CLI command set.
 */

async function main() {
  const registry = getRegistry();
  const algos = registry.list();
  
  console.log(`--- Verifying CLI Parity for ${algos.length} algorithms ---`);
  
  if (algos.length < 60) {
    throw new Error(`Registry parity failure: Expected 60+ algorithms, found ${algos.length}`);
  }

  const rootDir = process.cwd();
  
  const { ALGORITHMS: jsAlgos } = await import('../../apps/wasm4pm/dist/commands/run.js');

  const jsMissing = [];
  for (const algoObj of algos) {
    const algo = algoObj.id;
    if (!jsAlgos.includes(algo)) {
      jsMissing.push(algo);
    }
  }

  if (jsMissing.length > 0) {
    throw new Error(`Registry parity failure: JS CLI is missing ${jsMissing.length} algorithms:\n${jsMissing.join(', ')}`);
  }

  console.log(`[PASS] JS CLI Parity verified for ${algos.length} algorithms.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
