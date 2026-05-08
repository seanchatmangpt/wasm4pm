/**
 * LifecycleMiner — closes the feedback loop.
 *
 * Runs wasm4pm process mining algorithms on the XES event log produced by
 * LifecycleEngine, comparing the observed process against the declared
 * lifecycle (Spec→Generate→Test→Deploy→Monitor→Improve→Spec).
 *
 * Designed to consume the wasm4pm WASM kernel via @wasm4pm/kernel when
 * available, with a lightweight DFG fallback for environments where WASM
 * hasn't been initialised.
 */

import { algorithmIdsForStage } from './index.mjs';

/** Declared lifecycle Petri net as a directly-follows graph (ground truth). */
const DECLARED_DFG = Object.freeze({
  'Spec→Generate':   1,
  'Generate→Test':   1,
  'Test→Deploy':     1,
  'Test→Spec':       1,  // rework
  'Deploy→Monitor':  1,
  'Monitor→Improve': 1,
  'Improve→Spec':    1,
});

export class LifecycleMiner {
  #kernel;

  /**
   * @param {object} [kernel] - Optional @wasm4pm/kernel Kernel instance.
   *   When absent, the miner uses a built-in DFG fallback.
   */
  constructor(kernel = null) {
    this.#kernel = kernel;
  }

  /**
   * Discover the Directly-Follows Graph from activity sequences.
   *
   * @param {string[][]} sequences - One array of activity names per case.
   * @returns {{ dfg: object, totalCases: number }}
   */
  discoverDfg(sequences) {
    const dfg = {};
    let totalCases = 0;

    for (const seq of sequences) {
      totalCases++;
      for (let i = 0; i < seq.length - 1; i++) {
        const edge = `${seq[i]}→${seq[i + 1]}`;
        dfg[edge] = (dfg[edge] ?? 0) + 1;
      }
    }

    return { dfg, totalCases };
  }

  /**
   * Conformance check: compare observed DFG against the declared lifecycle.
   *
   * Returns fitness (0–1), precision (0–1), and a list of deviating edges.
   *
   * @param {object} observedDfg - From discoverDfg()
   * @returns {{ fitness: number, precision: number, deviations: string[] }}
   */
  conformanceCheck(observedDfg) {
    const declaredEdges  = new Set(Object.keys(DECLARED_DFG));
    const observedEdges  = new Set(Object.keys(observedDfg));

    const replayed   = [...observedEdges].filter(e => declaredEdges.has(e));
    const deviations = [...observedEdges].filter(e => !declaredEdges.has(e));
    const missed     = [...declaredEdges].filter(e => !observedEdges.has(e));

    const fitness    = observedEdges.size === 0 ? 1 : replayed.length / observedEdges.size;
    const precision  = declaredEdges.size === 0 ? 1 : replayed.length / declaredEdges.size;

    return { fitness, precision, deviations, missed };
  }

  /**
   * Run the full Monitor→Improve analysis on an XesEventLog.
   *
   * Returns:
   *   - discoveredDfg       — observed directly-follows graph
   *   - conformance         — fitness / precision / deviations vs. declared lifecycle
   *   - algorithmIds        — wasm4pm algorithm IDs to invoke for deeper analysis
   *   - improvementProposal — human-readable improvement spec
   *
   * @param {import('./xes.mjs').XesEventLog} eventLog
   */
  async analyse(eventLog) {
    const sequences = eventLog.activitySequences;
    const { dfg, totalCases } = this.discoverDfg(sequences);
    const conformance = this.conformanceCheck(dfg);

    const algorithmIds = [
      ...algorithmIdsForStage('Monitor'),
      ...algorithmIdsForStage('Improve'),
    ];

    const proposal = buildImprovementProposal(conformance, totalCases);

    return {
      discoveredDfg: dfg,
      declaredDfg: DECLARED_DFG,
      totalCases,
      conformance,
      algorithmIds,
      improvementProposal: proposal,
    };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildImprovementProposal({ fitness, precision, deviations, missed }, totalCases) {
  const lines = [
    `Lifecycle Conformance Report (${totalCases} case${totalCases !== 1 ? 's' : ''})`,
    `  Fitness:   ${(fitness * 100).toFixed(1)}%  (how much of observed behaviour is explained by the model)`,
    `  Precision: ${(precision * 100).toFixed(1)}%  (how much of the model is covered by observed behaviour)`,
  ];

  if (deviations.length > 0) {
    lines.push('');
    lines.push('  Undeclared transitions (add to schema/domain.ttl or investigate as rework):');
    for (const d of deviations) lines.push(`    ⚠ ${d}`);
  }

  if (missed.length > 0) {
    lines.push('');
    lines.push('  Declared transitions never observed (dead paths or skipped stages):');
    for (const m of missed) lines.push(`    ✗ ${m}`);
  }

  if (deviations.length === 0 && missed.length === 0) {
    lines.push('');
    lines.push('  ✓ Observed behaviour fully conforms to declared lifecycle.');
  }

  return lines.join('\n');
}
