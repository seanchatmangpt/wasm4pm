import { blake3Hex } from '../../receipts/_shared.js';
import {
  ALGO_HEALTH_CHECKS,
  CLAUDE_CODE_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  DATA_QUALITY_CHECKS,
  ENV_CHECKS,
  OBSERVABILITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  TPS_CHECKS,
} from './checks-arrays.js';
import {
  checkDoctorRepairBroker,
  checkReleaseCertificateClosure,
} from './safe-checks.js';
import {
  evaluateVision2030,
  type CapabilityDefinition,
  type Vision2030Report,
} from './vision2030.js';

/**
 * Vision 2030 is represented as an executable capability graph, not a slogan.
 * Ceilings encode where current checks prove a rail exists but do not yet prove
 * its complete runtime composition or replay closure.
 */
export const VISION_2030_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    id: 'environment-substrate',
    label: 'Environment substrate',
    description: 'Node, package manager, WASM artifact, toolchain, workspace, and writable evidence surfaces.',
    checks: ENV_CHECKS,
    failureStanding: 'BUILD_BROKEN',
  },
  {
    id: 'process-route-law',
    label: 'Process route law',
    description: 'Step types, registry consistency, state-machine integrity, profiles, and canonical naming.',
    checks: TPS_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'developer-experience',
    label: 'Developer experience',
    description: 'Agent settings, hooks, operating doctrine, and memory/index surfaces.',
    checks: CLAUDE_CODE_CHECKS,
  },
  {
    id: 'algorithm-runtime',
    label: 'Algorithm runtime',
    description: 'Registry and representative DFG, heuristic, ML, and streaming execution surfaces.',
    checks: ALGO_HEALTH_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'real-data-boundaries',
    label: 'Real data boundaries',
    description: 'XES and OCEL parsing plus invalid and empty-log refusal behavior.',
    checks: DATA_QUALITY_CHECKS,
  },
  {
    id: 'receipt-contract',
    label: 'Receipt contract',
    description: 'Exit codes, machine/human projections, and receipt schema integrity.',
    checks: OUTPUT_CONTRACT_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'observability-contract',
    label: 'Observability contract',
    description: 'OTEL sink, span naming, and service identity.',
    checks: OBSERVABILITY_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'configuration-admission',
    label: 'Configuration admission',
    description: 'Environment prefix, TOML parse, and precedence behavior.',
    checks: CONFIG_SYSTEM_CHECKS,
  },
  {
    id: 'brce-repair-admission',
    label: 'BRCE repair admission',
    description: 'Structured, shell-free repair intents with mandatory pre-actuation and outcome receipts.',
    checks: [checkDoctorRepairBroker],
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'ocel-powl-wasm-session',
    label: 'OCEL → POWL → WASM session',
    description: 'One admitted runtime session composes object-centric input, process semantics, WASM execution, and replay.',
    checks: [],
    unsupportedReason:
      'No single executable doctor boundary currently proves the complete OCEL → POWL → WASM → receipt → replay composition.',
  },
  {
    id: 'aat-live-runtime',
    label: 'AAT-Live runtime launch',
    description: 'A live adaptive runtime can be launched, observed, stopped, and replayed through the public CLI.',
    checks: [],
    unsupportedReason:
      'The public doctor surface has no exact AAT-Live launch-and-replay verifier at this ref.',
  },
  {
    id: 'release-certificate-closure',
    label: 'Release certificate closure',
    description: 'Package, WASM bundle, examples, behavior evidence, and certificate hashes recompute against one commit.',
    checks: [checkReleaseCertificateClosure],
  },
] as const;

export async function runVision2030Audit(options: {
  readonly only?: readonly string[];
  readonly now?: () => Date;
} = {}): Promise<Vision2030Report> {
  return evaluateVision2030(VISION_2030_CAPABILITIES, blake3Hex, options);
}
