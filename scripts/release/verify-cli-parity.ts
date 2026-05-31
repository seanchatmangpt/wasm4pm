import { execFileSync } from 'node:child_process';
import { getRegistry } from '../../packages/kernel/src/registry.js';
import {
  ALGORITHM_CLI_ALIASES,
  ALGORITHM_IDS,
  resolveAlgorithmId,
} from '../../packages/contracts/src/templates/algorithm-registry.js';

/**
 * scripts/release/verify-cli-parity.ts
 *
 * Verifies CLI ↔ kernel ↔ contracts alignment beyond a static import check.
 */

const KERNEL_REMOVED_IDS = new Set(['petri_net_reduction']);

async function main() {
  const registry = getRegistry();
  const algos = registry.list();
  const registryIds = algos.map((a) => a.id);

  console.log(`--- Verifying CLI Parity for ${algos.length} algorithms ---`);

  if (algos.length < 60) {
    throw new Error(`Registry parity failure: Expected 60+ algorithms, found ${algos.length}`);
  }

  const { ALGORITHMS: jsAlgos } = await import('../../apps/wasm4pm/dist/commands/run.js');

  const jsMissing: string[] = [];
  for (const algoObj of algos) {
    if (!jsAlgos.includes(algoObj.id)) {
      jsMissing.push(algoObj.id);
    }
  }
  if (jsMissing.length > 0) {
    throw new Error(
      `Registry parity failure: JS CLI is missing ${jsMissing.length} algorithms:\n${jsMissing.join(', ')}`
    );
  }
  console.log(`[PASS] run.ts ALGORITHMS includes all ${algos.length} registry IDs`);

  // Contracts template IDs must resolve in kernel (except known removals)
  const contractsOnly = ALGORITHM_IDS.filter(
    (id) => !registryIds.includes(id) && !KERNEL_REMOVED_IDS.has(id)
  );
  if (contractsOnly.length > 0) {
    throw new Error(
      `Contracts/kernel drift: ALGORITHM_IDS not in kernel registry: ${contractsOnly.join(', ')}`
    );
  }
  console.log(`[PASS] contracts ALGORITHM_IDS aligned with kernel (${ALGORITHM_IDS.length} template IDs)`);

  // Every CLI alias must resolve to a live registry ID
  const aliasFailures: string[] = [];
  for (const [registryId, alias] of Object.entries(ALGORITHM_CLI_ALIASES)) {
    if (!registryIds.includes(registryId)) {
      aliasFailures.push(`${alias} → ${registryId} (missing from kernel)`);
      continue;
    }
    const resolved = resolveAlgorithmId(alias, registryIds);
    if (resolved !== registryId) {
      aliasFailures.push(`${alias} → ${resolved ?? 'undefined'} (expected ${registryId})`);
    }
  }
  if (aliasFailures.length > 0) {
    throw new Error(
      `CLI alias resolution failures (${aliasFailures.length}):\n${aliasFailures.slice(0, 10).join('\n')}${
        aliasFailures.length > 10 ? `\n... +${aliasFailures.length - 10} more` : ''
      }`
    );
  }
  console.log(
    `[PASS] ${Object.keys(ALGORITHM_CLI_ALIASES).length} CLI aliases resolve to kernel registry IDs`
  );

  // Subprocess: wpm algorithms --format json returns >= registry count
  const wpmBin = new URL('../../apps/wasm4pm/dist/bin/wpm.js', import.meta.url).pathname;
  const algoJson = execFileSync(process.execPath, [wpmBin, 'algorithms', '--format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = JSON.parse(algoJson.slice(algoJson.indexOf('{'))) as {
    payload?: { algorithms?: unknown[] };
  };
  const listed = parsed.payload?.algorithms?.length ?? 0;
  if (listed < algos.length) {
    throw new Error(
      `wpm algorithms listed ${listed} entries but kernel registry has ${algos.length}`
    );
  }
  console.log(`[PASS] wpm algorithms --format json lists ${listed} algorithms (registry ${algos.length})`);

  console.log(`[PASS] CLI parity verified for ${algos.length} algorithms.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
