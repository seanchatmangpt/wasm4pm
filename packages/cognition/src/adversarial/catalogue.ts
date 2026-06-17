//! Adversarial detector catalogue

export const ADVERSARIAL_DETECTORS = [
  {
    code: 'BROKEN_LOGICAL_CLOCK',
    severity: 'fatal',
    description: 'Inference trace step order violated (non-monotone step, depth jump, or empty kind)'
  },
  {
    code: 'RECEIPT_FORGERY',
    severity: 'fatal',
    description: 'Receipt output_hash does not recompute correctly from breed + output, or orphan receipt with no OCEL corpus entry'
  },
  {
    code: 'STUB_GATE_PASS',
    severity: 'fatal',
    description: 'Gate passed with zero evidence items'
  },
  {
    code: 'HUMAN_OUTPUT_USED_AS_AUTHORITY',
    severity: 'error',
    description: 'Human text used as authority source'
  },
  {
    code: 'MISSING_RUNTIME_EVIDENCE',
    severity: 'fatal',
    description: 'Gate passed without runtime proof'
  },
  {
    code: 'CENTRAL_EVENT_FIREHOSE_REINTRODUCED',
    severity: 'fatal',
    description: 'Centralized event bus detected'
  },
  {
    code: 'AGENT_SELF_CERTIFIES',
    severity: 'fatal',
    description: 'Executor and verifier are same agent'
  },
  {
    code: 'BENCHMARK_EXPECTATION_MISSING',
    severity: 'warning',
    description: 'Benchmark expected verdict missing'
  },
  {
    code: 'REPAIR_WEAKENS_GATE',
    severity: 'error',
    description: 'Repair lowered gate threshold'
  },
  {
    code: 'REPLAY_BROKEN',
    severity: 'fatal',
    description: 'Receipt chain verification failed'
  }
];

export function getAdversarialCatalogue() {
  return ADVERSARIAL_DETECTORS;
}
