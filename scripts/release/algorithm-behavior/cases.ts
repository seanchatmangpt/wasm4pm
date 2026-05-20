import { getRegistry } from '../../../packages/kernel/src/registry.js';
import { fixtures } from './fixtures.js';
import type { 
  AlgorithmBehaviorRow, 
  PositiveCaseEvidence, 
  NegativeCaseEvidence, 
  InvariantCaseEvidence,
  FailureCode
} from './types.js';

/**
 * Dynamically map algorithms to their positive, negative, and invariant cases.
 */
export function generateCaseRegistry(): AlgorithmBehaviorRow[] {
  const registry = getRegistry();
  const algorithms = registry.list();
  
  return algorithms.map(algo => {
    // 1. Map Positive Case based on category
    let positiveCase: PositiveCaseEvidence = {
      case_id: `${algo.id}.valid_minimal_log`,
      input_hash: fixtures.valid.runningExampleHash,
      status: 'failed', // pending run
      result_hash: '',
      duration_ms: 0,
      receipt_hash: ''
    };

    // 2. Map Negative Cases
    const negativeCases: NegativeCaseEvidence[] = [
      {
        case_id: `${algo.id}.empty_log`,
        input_hash: fixtures.invalid.emptyLogHash,
        status: 'failed_incorrectly', // pending run
        error_code: 'EMPTY_EVENT_LOG',
        no_panic: true,
        no_false_success: true,
        receipt_hash: ''
      },
      {
        case_id: `${algo.id}.malformed_log`,
        input_hash: fixtures.invalid.malformedHash,
        status: 'failed_incorrectly', // pending run
        error_code: 'MALFORMED_EVENT_LOG',
        no_panic: true,
        no_false_success: true,
        receipt_hash: ''
      }
    ];

    // Add category-specific negatives
    if (algo.category === 'prediction' || algo.category === 'machine_learning') {
      negativeCases.push({
        case_id: `${algo.id}.missing_features`,
        input_hash: fixtures.invalid.malformedHash, // reuse
        status: 'failed_incorrectly',
        error_code: 'PREDICTION_FEATURES_REQUIRED',
        no_panic: true,
        no_false_success: true,
        receipt_hash: ''
      });
    }

    // 3. Map Invariant Case (Determinism / Bounded)
    const isNonDeterministic = ['genetic_algorithm', 'pso', 'aco', 'simulated_annealing'].includes(algo.id);
    const invariantCase: InvariantCaseEvidence = isNonDeterministic ? {
      case_id: `${algo.id}.seeded_repeatability`,
      seed: 42,
      status: 'failed',
      result_schema_valid: false,
      fitness_within_expected_range: false
    } : {
      case_id: `${algo.id}.deterministic_same_input`,
      status: 'failed',
      first_result_hash: '',
      second_result_hash: '',
      stable: false
    };

    return {
      algorithm_id: algo.id,
      category: algo.category,
      profiles: algo.profiles || [],
      registry_present: true,
      ts_dispatch_present: false, // updated by runner
      cli_present: false,         // updated by runner
      wasm_export_present: false, // updated by runner
      positive_cases: [positiveCase],
      negative_cases: negativeCases,
      invariant_cases: [invariantCase],
      algorithm_evidence_hash: ''
    };
  });
}
