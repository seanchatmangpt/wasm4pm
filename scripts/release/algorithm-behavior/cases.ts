import { fixtures } from './fixtures.js';
import type { 
  AlgorithmBehaviorRow, 
  PositiveCaseEvidence, 
  NegativeCaseEvidence, 
  InvariantCaseEvidence
} from './types.js';

/**
 * Dynamically map algorithms to their positive, negative, and invariant cases.
 * 
 * MANUFACTURED BY GGEN FROM ONTOLOGY
 * DO NOT EDIT MANUALLY.
 */
export function generateCaseRegistry(): AlgorithmBehaviorRow[] {
  return [
    {
      algorithm_id: 'a_star',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'a_star.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'a_star.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'a_star.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'a_star.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'aco',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'aco.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'aco.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'aco.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'aco.SeededRepeatabilityCase',
          seed: 42,
          status: 'failed',
          result_schema_valid: false,
          fitness_within_expected_range: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'agentic_pipeline',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'agentic_pipeline.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'agentic_pipeline.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'agentic_pipeline.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'agentic_pipeline.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'alignments',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'alignments.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'alignments.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'alignments.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'alignments.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'alpha_plus_plus',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'alpha_plus_plus.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'alpha_plus_plus.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'alpha_plus_plus.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'alpha_plus_plus.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'analyze_process_speedup',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'analyze_process_speedup.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'analyze_process_speedup.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'analyze_process_speedup.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'analyze_process_speedup.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'analyze_variant_complexity',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'analyze_variant_complexity.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'analyze_variant_complexity.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'analyze_variant_complexity.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'analyze_variant_complexity.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'automl_classify',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'automl_classify.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'automl_classify.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'automl_classify.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'automl_classify.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'automl_forecast',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'automl_forecast.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'automl_forecast.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'automl_forecast.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'automl_forecast.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'batches',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'batches.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'batches.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'batches.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'batches.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'bpmn_import',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'bpmn_import.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'bpmn_import.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'bpmn_import.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'bpmn_import.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'causal_graph',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'causal_graph.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'causal_graph.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'causal_graph.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'causal_graph.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'complexity_metrics',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'complexity_metrics.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'complexity_metrics.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'complexity_metrics.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'complexity_metrics.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'compute_activity_transition_matrix',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'compute_activity_transition_matrix.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'compute_activity_transition_matrix.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'compute_activity_transition_matrix.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'compute_activity_transition_matrix.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'compute_ewma',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'compute_ewma.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'compute_ewma.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'compute_ewma.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'compute_ewma.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'compute_trace_similarity_matrix',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'compute_trace_similarity_matrix.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'compute_trace_similarity_matrix.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'compute_trace_similarity_matrix.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'compute_trace_similarity_matrix.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'correlation_miner',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'correlation_miner.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'correlation_miner.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'correlation_miner.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'correlation_miner.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'declare',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'declare.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'declare.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'declare.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'declare.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'detect_drift',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'detect_drift.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'detect_drift.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'detect_drift.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'detect_drift.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'dfg',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'dfg.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'dfg.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'dfg.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'dfg.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'etconformance_precision',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'etconformance_precision.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'etconformance_precision.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'etconformance_precision.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'etconformance_precision.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'generalization',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'generalization.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'generalization.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'generalization.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'generalization.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'genetic_algorithm',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'genetic_algorithm.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'genetic_algorithm.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'genetic_algorithm.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'genetic_algorithm.SeededRepeatabilityCase',
          seed: 42,
          status: 'failed',
          result_schema_valid: false,
          fitness_within_expected_range: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'handover_network',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'handover_network.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'handover_network.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'handover_network.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'handover_network.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'heuristic_miner',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'heuristic_miner.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'heuristic_miner.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'heuristic_miner.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'heuristic_miner.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'hierarchical_dfg',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'hierarchical_dfg.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'hierarchical_dfg.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'hierarchical_dfg.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'hierarchical_dfg.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'hill_climbing',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'hill_climbing.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'hill_climbing.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'hill_climbing.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'hill_climbing.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ilp',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ilp.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ilp.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ilp.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ilp.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'inductive_miner',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'inductive_miner.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'inductive_miner.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'inductive_miner.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'inductive_miner.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'log_to_trie',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'log_to_trie.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'log_to_trie.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'log_to_trie.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'log_to_trie.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ml_anomaly',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ml_anomaly.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ml_anomaly.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ml_anomaly.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ml_anomaly.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ml_classify',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ml_classify.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ml_classify.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ml_classify.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ml_classify.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ml_cluster',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ml_cluster.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ml_cluster.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ml_cluster.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ml_cluster.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ml_forecast',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ml_forecast.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ml_forecast.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ml_forecast.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ml_forecast.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ml_pca',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ml_pca.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ml_pca.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ml_pca.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ml_pca.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ml_regress',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ml_regress.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ml_regress.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ml_regress.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ml_regress.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'monte_carlo_simulation',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'monte_carlo_simulation.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'monte_carlo_simulation.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'monte_carlo_simulation.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'monte_carlo_simulation.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ocel_dfg',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ocel_dfg.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ocel_dfg.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ocel_dfg.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ocel_dfg.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ocel_dfg_per_type',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ocel_dfg_per_type.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ocel_dfg_per_type.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ocel_dfg_per_type.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ocel_dfg_per_type.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ocel_encode',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ocel_encode.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ocel_encode.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ocel_encode.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ocel_encode.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ocel_oc_declare',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ocel_oc_declare.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ocel_oc_declare.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ocel_oc_declare.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ocel_oc_declare.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ocel_ocla',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ocel_ocla.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ocel_ocla.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ocel_ocla.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ocel_ocla.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'ocel_petri_net',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'ocel_petri_net.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'ocel_petri_net.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'ocel_petri_net.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'ocel_petri_net.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'optimized_dfg',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'optimized_dfg.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'optimized_dfg.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'optimized_dfg.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'optimized_dfg.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'performance_spectrum',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'performance_spectrum.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'performance_spectrum.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'performance_spectrum.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'performance_spectrum.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'playout',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'playout.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'playout.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'playout.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'playout.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'pnml_import',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'pnml_import.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'pnml_import.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'pnml_import.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'pnml_import.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'powl_to_process_tree',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'powl_to_process_tree.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'powl_to_process_tree.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'powl_to_process_tree.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'powl_to_process_tree.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'predict_next_activity',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'predict_next_activity.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'predict_next_activity.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'predict_next_activity.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'predict_next_activity.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'predict_outcome',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'predict_outcome.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'predict_outcome.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'predict_outcome.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'predict_outcome.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'predict_remaining_time',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'predict_remaining_time.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'predict_remaining_time.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'predict_remaining_time.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'predict_remaining_time.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'process_skeleton',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'process_skeleton.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'process_skeleton.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'process_skeleton.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'process_skeleton.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'pso',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'pso.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'pso.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'pso.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'pso.SeededRepeatabilityCase',
          seed: 42,
          status: 'failed',
          result_schema_valid: false,
          fitness_within_expected_range: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'simd_streaming_dfg',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'simd_streaming_dfg.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'simd_streaming_dfg.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'simd_streaming_dfg.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'simd_streaming_dfg.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'simulated_annealing',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'simulated_annealing.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'simulated_annealing.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'simulated_annealing.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'simulated_annealing.SeededRepeatabilityCase',
          seed: 42,
          status: 'failed',
          result_schema_valid: false,
          fitness_within_expected_range: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'smart_engine',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'smart_engine.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'smart_engine.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'smart_engine.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'smart_engine.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'streaming_log',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'streaming_log.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'streaming_log.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'streaming_log.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'streaming_log.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'transition_system',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'transition_system.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'transition_system.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'transition_system.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'transition_system.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'working_together_network',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'working_together_network.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'working_together_network.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'working_together_network.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'working_together_network.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    },
    {
      algorithm_id: 'yawl_export',
      category: 'discovery', // Extracted from ontology mapping if expanded
      profiles: ['fast', 'balanced', 'quality'],
      registry_present: true,
      ts_dispatch_present: false,
      cli_present: false,
      wasm_export_present: false,
      positive_cases: [
        {
          case_id: 'yawl_export.valid_minimal_log',
          input_hash: fixtures.valid.runningExampleHash,
          status: 'failed',
          result_hash: '',
          duration_ms: 0,
          receipt_hash: ''
        }
      ],
      negative_cases: [
        {
          case_id: 'yawl_export.MalformedLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'MALFORMED_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
        {
          case_id: 'yawl_export.EmptyLogCase',
          input_hash: fixtures.invalid.emptyLogHash, // Usually dynamic based on case type
          status: 'failed_incorrectly',
          error_code: 'EMPTY_EVENT_LOG',
          no_panic: true,
          no_false_success: true,
          receipt_hash: ''
        },
      ],
      invariant_cases: [
        {
          case_id: 'yawl_export.DeterministicSameInputCase',
          status: 'failed',
          first_result_hash: '',
          second_result_hash: '',
          stable: false
        }
      ],
      algorithm_evidence_hash: ''
    }
  ];
}
