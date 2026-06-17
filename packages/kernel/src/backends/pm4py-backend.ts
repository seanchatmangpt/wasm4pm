/**
 * pm4py-backend.ts
 *
 * Pm4pyBackend: declares capabilities for a Python pm4py bridge.
 * This backend requires a Python environment with pm4py installed and is
 * excluded from browser/edge deployments via the environment gate (Rule 1).
 *
 * Used by backend-registry tests to exercise the 7-rule selection algorithm,
 * in particular Rule 1 (Python requirement) and Rule 4 (research quality tier).
 */

import type {
  MiningBackend,
  BackendCapabilities,
  EventLogIR,
  ModelIR,
  ResultEnvelope,
  BudgetEnvelope,
  ConformanceResult,
  AnalysisTask,
} from '../mining-backend.js';

/**
 * Algorithms supported by the pm4py Python bridge.
 * Superset of WASM algorithms; includes research-grade variants not in WASM.
 */
const PM4PY_ALGORITHMS: ReadonlyArray<string> = [
  'alpha_miner',
  'alpha_plus_plus',
  'inductive_miner',
  'heuristic_miner',
  'dfg',
  'ilp',
  'declare',
];

export class Pm4pyBackend implements MiningBackend {
  readonly id = 'pm4py';

  private ready = false;

  async init(): Promise<void> {
    // Python bridge is not available in this build. Always fails fast.
    this.ready = false;
    throw new Error('Pm4pyBackend: Python bridge is not available in this build');
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  capabilities(): BackendCapabilities {
    return {
      algorithmFamilies: ['discovery', 'conformance', 'analysis'],
      outputTypes: ['dfg', 'petri_net', 'declare'],
      environment: {
        browserSafe: false,
        edgeSafe: false,
        requiresPython: true,
        requiresNetwork: false,
      },
      latencyClass: 'seconds',
      deterministic: true,
      maxQualityTier: 'research',
      supportedAlgorithmIds: PM4PY_ALGORITHMS,
      maxConcurrentInvocations: 2,
    };
  }

  async discover(
    _log: EventLogIR,
    algorithmId: string,
    _budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ModelIR>> {
    throw new Error(`Pm4pyBackend: Python bridge not available — cannot run ${algorithmId}`);
  }

  async conformance(
    _log: EventLogIR,
    _model: ModelIR,
    _budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ConformanceResult>> {
    throw new Error('Pm4pyBackend: Python bridge not available — cannot run conformance');
  }

  async analyze(
    _log: EventLogIR,
    _task: AnalysisTask,
    _budget: BudgetEnvelope
  ): Promise<ResultEnvelope<unknown>> {
    throw new Error('Pm4pyBackend: Python bridge not available — cannot run analysis');
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms: number; message: string }> {
    return { healthy: false, latency_ms: 0, message: 'Python bridge not initialized' };
  }
}
