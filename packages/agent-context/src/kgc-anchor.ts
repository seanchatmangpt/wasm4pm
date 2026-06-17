import { createHash } from 'node:crypto';
import type { AdmittedSubstrate } from './substrate.js';

export interface AnchorResult {
  universe_hash: string;
  t_ns: bigint;
}

/**
 * Compute a BLAKE3-equivalent anchor over the admitted substrate.
 *
 * v1: uses SHA-3-256 (Node built-in) over a deterministic serialization of the
 * admitted algorithm set. The hash is stable for the same substrate and serves
 * as the ContextPacket.snapshotHash — every packet is traceable to the exact
 * admitted universe that produced it.
 *
 * Upgrade path: swap this function for KGCStore + GitBackbone + freezeUniverse
 * from @unrdf/kgc-4d once the publish dep chain is resolved (workspace:* refs
 * in @unrdf/otel → @unrdf/manufacturing are not on npm as of v26.5.5).
 */
export async function anchorSubstrate(
  substrate: AdmittedSubstrate,
): Promise<AnchorResult> {
  // Deterministic serialization: sorted algorithm list + wasm exports
  const payload = JSON.stringify({
    admitted: substrate.admittedAlgorithms.slice().sort(),
    exports: substrate.wasmExportMap
      .slice()
      .sort((a, b) => a.algorithm.localeCompare(b.algorithm))
      .map(e => ({ a: e.algorithm, r: e.rustExport, v: e.verified })),
    receiptCount: substrate.receiptCount,
  });

  const hash = createHash('sha3-256').update(payload).digest('hex');
  // Nanosecond timestamp via hrtime for monotonic precision
  const [sec, ns] = process.hrtime();
  const t_ns = BigInt(sec) * 1_000_000_000n + BigInt(ns);

  return { universe_hash: hash, t_ns };
}
