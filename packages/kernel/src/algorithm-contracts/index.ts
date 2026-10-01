import a_star from './a_star.js';
import aco from './aco.js';
import alpha_plus_plus from './alpha_plus_plus.js';
import declare from './declare.js';
import dfg from './dfg.js';
import genetic_algorithm from './genetic_algorithm.js';
import heuristic_miner from './heuristic_miner.js';
import hill_climbing from './hill_climbing.js';
import ilp from './ilp.js';
import inductive_miner from './inductive_miner.js';
import optimized_dfg from './optimized_dfg.js';
import process_skeleton from './process_skeleton.js';
import pso from './pso.js';
import simulated_annealing from './simulated_annealing.js';
import hierarchical_dfg from './hierarchical_dfg.js';
import simd_streaming_dfg from './simd_streaming_dfg.js';
import smart_engine from './smart_engine.js';
import streaming_log from './streaming_log.js';
import analyze_process_speedup from './analyze_process_speedup.js';
import analyze_variant_complexity from './analyze_variant_complexity.js';
import batches from './batches.js';
import causal_graph from './causal_graph.js';
import compute_activity_transition_matrix from './compute_activity_transition_matrix.js';
import compute_trace_similarity_matrix from './compute_trace_similarity_matrix.js';
import correlation_miner from './correlation_miner.js';
import log_to_trie from './log_to_trie.js';
import performance_spectrum from './performance_spectrum.js';
import transition_system from './transition_system.js';
import alignments from './alignments.js';
import complexity_metrics from './complexity_metrics.js';
import etconformance_precision from './etconformance_precision.js';
import generalization from './generalization.js';
import monte_carlo_simulation from './monte_carlo_simulation.js';
import playout from './playout.js';
import bpmn_import from './bpmn_import.js';
import pnml_import from './pnml_import.js';
import powl_to_process_tree from './powl_to_process_tree.js';
import yawl_export from './yawl_export.js';
import ocel_dfg from './ocel_dfg.js';
import ocel_dfg_per_type from './ocel_dfg_per_type.js';
import ocel_encode from './ocel_encode.js';
import ocel_oc_declare from './ocel_oc_declare.js';
import ocel_ocla from './ocel_ocla.js';
import ocel_petri_net from './ocel_petri_net.js';
import compute_ewma from './compute_ewma.js';
import detect_drift from './detect_drift.js';
import predict_next_activity from './predict_next_activity.js';
import predict_outcome from './predict_outcome.js';
import predict_remaining_time from './predict_remaining_time.js';
import automl_classify from './automl_classify.js';
import automl_forecast from './automl_forecast.js';
import ml_anomaly from './ml_anomaly.js';
import ml_classify from './ml_classify.js';
import ml_cluster from './ml_cluster.js';
import ml_forecast from './ml_forecast.js';
import ml_pca from './ml_pca.js';
import ml_regress from './ml_regress.js';
import handover_network from './handover_network.js';
import working_together_network from './working_together_network.js';
import agentic_pipeline from './agentic_pipeline.js';

export const algorithmContracts = Object.freeze([
  a_star,
  aco,
  alpha_plus_plus,
  declare,
  dfg,
  genetic_algorithm,
  heuristic_miner,
  hill_climbing,
  ilp,
  inductive_miner,
  optimized_dfg,
  process_skeleton,
  pso,
  simulated_annealing,
  hierarchical_dfg,
  simd_streaming_dfg,
  smart_engine,
  streaming_log,
  analyze_process_speedup,
  analyze_variant_complexity,
  batches,
  causal_graph,
  compute_activity_transition_matrix,
  compute_trace_similarity_matrix,
  correlation_miner,
  log_to_trie,
  performance_spectrum,
  transition_system,
  alignments,
  complexity_metrics,
  etconformance_precision,
  generalization,
  monte_carlo_simulation,
  playout,
  bpmn_import,
  pnml_import,
  powl_to_process_tree,
  yawl_export,
  ocel_dfg,
  ocel_dfg_per_type,
  ocel_encode,
  ocel_oc_declare,
  ocel_ocla,
  ocel_petri_net,
  compute_ewma,
  detect_drift,
  predict_next_activity,
  predict_outcome,
  predict_remaining_time,
  automl_classify,
  automl_forecast,
  ml_anomaly,
  ml_classify,
  ml_cluster,
  ml_forecast,
  ml_pca,
  ml_regress,
  handover_network,
  working_together_network,
  agentic_pipeline
] as const);

export type AlgorithmContractId = (typeof algorithmContracts)[number]['id'];
