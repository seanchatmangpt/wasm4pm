/**
 * Adversarial Algorithm Audit Runner — Master Orchestrator
 *
 * Runs all 41 registered algorithms against benchmark datasets.
 * Direct WASM calls, bypasses CLI layer which has assumptions.
 *
 * Pattern:
 * 1. Load log once: wasm.load_eventlog_from_xes(xesContent) → logHandle
 * 2. For each algorithm:
 *    a. Call WASM function (wasmFn) with standard params
 *    b. Measure latency: performance.now()
 *    c. Parse result, extract model handle (if applicable)
 *    d. Measure fitness via token_based_replay (if petrinet)
 *    e. Measure precision/generalization/simplicity
 *    f. Classify algorithm into tier
 * 3. Generate 4D quality report
 * 4. Output recommendations (which algorithms to keep/fix/remove)
 */

import * as fs from 'fs';
import * as path from 'path';
import { ALGORITHM_MANIFEST } from './algorithm-manifest.js';
import { measure4DQuality, summarizeQuality, AlgorithmResult } from './quality-pipeline.js';
import { classifyAll, summarizeTiers, printTierSummary } from './tier-classifier.js';
import { verifyFitnessFormula } from './oracle.js';

// Minimal valid test inputs for I/O algorithms
const MINIMAL_PNML_XML = `<?xml version="1.0" encoding="UTF-8"?>
<pnml><net id="n" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
  <place id="source"><initialMarking><text>1</text></initialMarking></place>
  <place id="sink"/>
  <transition id="t1"><name><text>A</text></name></transition>
  <arc id="a1" source="source" target="t1"/>
  <arc id="a2" source="t1" target="sink"/>
</net></pnml>`;

const MINIMAL_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d1">
  <process id="p1" isExecutable="true">
    <startEvent id="start"/>
    <task id="t1" name="Task A"/>
    <endEvent id="end"/>
    <sequenceFlow id="f1" sourceRef="start" targetRef="t1"/>
    <sequenceFlow id="f2" sourceRef="t1" targetRef="end"/>
  </process>
</definitions>`;

export interface AuditConfig {
  logPath: string;                    // XES file to test
  activityKey: string;                // 'concept:name' standard
  outputDir: string;                  // Where to save results
  verbose: boolean;                   // Print per-algorithm progress
  skipMissingAlgorithms: boolean;     // If true, skip NOT_EXPORTED
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  logPath: './data/Sepsis Cases - Event Log.xes',
  activityKey: 'concept:name',
  outputDir: './benchmarks/adversarial/results',
  verbose: true,
  skipMissingAlgorithms: true,
};

/**
 * Run adversarial audit against all 41 algorithms.
 *
 * Returns array of AlgorithmResult with 4D quality metrics and tier classification.
 */
export async function runAdversarialAudit(
  wasm: any,
  config: AuditConfig = DEFAULT_AUDIT_CONFIG
): Promise<{
  results: AlgorithmResult[];
  summary: any;
  classifications: any;
  timestamp: string;
}> {
  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const results: AlgorithmResult[] = [];

  // Load log once
  if (!fs.existsSync(config.logPath)) {
    throw new Error(`Log file not found: ${config.logPath}`);
  }

  if (config.verbose) {
    console.log(`📊 Loading ${config.logPath}...`);
  }

  const xesContent = fs.readFileSync(config.logPath, 'utf-8');
  let logHandle: string;

  try {
    logHandle = wasm.load_eventlog_from_xes(xesContent);
  } catch (e) {
    throw new Error(`Failed to load event log: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (config.verbose) {
    console.log(`✅ Log loaded. logHandle=${logHandle}`);
    console.log(`\n🔬 Running audit on ${ALGORITHM_MANIFEST.length} algorithms...\n`);
  }

  // Test each algorithm
  for (const meta of ALGORITHM_MANIFEST) {
    if (config.skipMissingAlgorithms && meta.wasmFn === 'NOT_EXPORTED') {
      if (config.verbose) {
        console.log(`⏭️  ${meta.id}: NOT_EXPORTED (skipped)`);
      }
      continue;
    }

    const startTime = performance.now();
    let crashed = false;
    let error: string | undefined;
    let model: any = null;
    let modelHandle: string | undefined;
    let outputType = meta.outputType;

    try {
      // Call WASM function
      const wasmFn = wasm[meta.wasmFn];
      if (!wasmFn) {
        throw new Error(`WASM function not exported: ${meta.wasmFn}`);
      }

      // Parse result helper — move to before branches to avoid Temporal Dead Zone
      const parse = (r: any) => (typeof r === 'string' ? JSON.parse(r) : r);

      // Call with standard params — see algorithm signatures for requirements
      let result: any;
      if (meta.id === 'heuristic_miner') {
        // dependency_threshold: 0.2 filters ~30% of edges for typical logs
        result = wasmFn(logHandle, config.activityKey, 0.2);
      } else if (meta.id === 'inductive_miner') {
        // Same threshold as heuristic
        result = wasmFn(logHandle, config.activityKey, 0.2);
      } else if (meta.id === 'a_star') {
        // max_iterations: 100 explores 100 states
        result = wasmFn(logHandle, config.activityKey, 100);
      } else if (meta.id === 'pso') {
        // swarm_size, iterations
        result = wasmFn(logHandle, config.activityKey, 50, 20);
      } else if (meta.id === 'aco') {
        // num_ants, iterations (delegates to discover_aco_algorithm internally)
        result = wasmFn(logHandle, config.activityKey, 50, 20);
      } else if (meta.id === 'genetic_algorithm') {
        // population_size, generations
        result = wasmFn(logHandle, config.activityKey, 50, 30);
      } else if (meta.id === 'simulated_annealing') {
        // temperature, cooling_rate
        result = wasmFn(logHandle, config.activityKey, 100.0, 0.95);
      } else if (meta.id === 'causal_graph') {
        // causal_alpha takes no extra params beyond handle + activity_key
        result = wasmFn(logHandle, config.activityKey);
      } else if (meta.id === 'performance_spectrum') {
        // timestamp_key, target_activity
        result = wasmFn(logHandle, config.activityKey, 'time:timestamp', '');
      } else if (meta.id === 'batches') {
        // timestamp_key
        result = wasmFn(logHandle, config.activityKey, 'time:timestamp');
      } else if (meta.id === 'correlation_miner') {
        // timestamp_key, threshold
        result = wasmFn(logHandle, config.activityKey, 'time:timestamp', 0.5);
      } else if (meta.id === 'transition_system') {
        // window, direction
        result = wasmFn(logHandle, config.activityKey, 2, 'forward');
      } else if (meta.id === 'hierarchical_dfg') {
        // num_chunks
        result = wasmFn(logHandle, config.activityKey, 4);
      } else if (meta.id === 'optimized_dfg') {
        // fitness_weight, simplicity_weight
        result = wasmFn(logHandle, config.activityKey, 0.7, 0.3);
      } else if (meta.id === 'smart_engine') {
        // smart_engine_run requires a SmartEngine handle, not an EventLog handle
        const seHandle = wasm.smart_engine_create(logHandle, 'dfg', config.activityKey);
        result = wasm.smart_engine_run(seHandle, 'dfg', '[]');
      } else if (meta.id === 'pnml_import') {
        // pnml_string
        result = wasmFn(MINIMAL_PNML_XML);
      } else if (meta.id === 'bpmn_import') {
        // bpmn_xml
        result = wasmFn(MINIMAL_BPMN_XML);
      } else if (meta.id === 'playout') {
        // dfg_json, params
        const dfgResult = wasmFn === wasm.play_out_dfg ?
          parse(wasm.discover_dfg(logHandle, config.activityKey)) :
          parse(result);
        const dfgJson = typeof dfgResult === 'string' ? dfgResult : JSON.stringify(dfgResult);
        result = wasm.play_out_dfg(dfgJson, null);
      } else if (meta.id === 'monte_carlo_simulation') {
        // log_handle, powl_handle (unused), root_id (unused), config_json
        const mcConfig = JSON.stringify({
          num_cases: 100,
          inter_arrival_mean_ms: 100,
          activity_service_time_ms: {},
          resource_capacity: {},
          simulation_time_ms: 60000,
          random_seed: 42,
        });
        result = wasmFn(logHandle, '', '', mcConfig);
      } else if (meta.id === 'ml_anomaly') {
        // score_log_anomalies requires a stored DFG handle, not inline JSON
        const dfgHandle = wasm.discover_dfg_handle(logHandle, config.activityKey);
        result = wasmFn(logHandle, dfgHandle, config.activityKey);
      } else if (meta.id === 'etconformance_precision') {
        // log_handle, petri_net_handle, activity_key — first discover alpha++ with min_support
        const pnResult = parse(wasm.discover_alpha_plus_plus(logHandle, config.activityKey, 0.1));
        result = wasmFn(logHandle, pnResult.handle, config.activityKey);
      } else if (meta.id === 'generalization') {
        // log_handle, petri_net_handle, activity_key — same as etconformance
        const pnResult = parse(wasm.discover_alpha_plus_plus(logHandle, config.activityKey, 0.1));
        result = wasmFn(logHandle, pnResult.handle, config.activityKey);
      } else if (meta.id === 'alignments') {
        // log_handle, petri_net_handle, activity_key, cost_config_json — same pattern
        const pnResult = parse(wasm.discover_alpha_plus_plus(logHandle, config.activityKey, 0.1));
        result = wasmFn(logHandle, pnResult.handle, config.activityKey, '{}');
      } else if (meta.id === 'ml_cluster') {
        // cluster_traces requires num_clusters parameter
        result = wasmFn(logHandle, config.activityKey, 5);
      } else {
        result = wasmFn(logHandle, config.activityKey);
      }

      const latencyMs = performance.now() - startTime;

      // Parse result — skip for XML/text-based formats (bpmn_import, pnml_import)
      if (meta.id === 'bpmn_import' || meta.id === 'pnml_import') {
        // These return text/XML, not JSON
        model = { text: typeof result === 'string' ? result : JSON.stringify(result) };
      } else {
        model = parse(result);
      }

      // Extract handle if present (for conformance checking)
      if (model.handle) {
        modelHandle = model.handle;
      }

      // Measure 4D quality
      const { quality, error: qualityError } = await measure4DQuality(
        wasm,
        meta.id,
        outputType,
        model,
        modelHandle,
        logHandle,
        config.activityKey
      );

      results.push({
        algorithm: meta.id,
        outputType,
        model,
        modelHandle,
        latencyMs,
        quality,
        crashed: false,
        error: qualityError,
      });

      if (config.verbose) {
        const fitnessStr =
          quality.fitness > 0
            ? `fitness=${quality.fitness.toFixed(3)}`
            : `no fitness (${outputType})`;
        console.log(
          `✅ ${meta.id}: ${latencyMs.toFixed(1)}ms, ${fitnessStr}`
        );
      }
    } catch (e) {
      crashed = true;
      error = e instanceof Error ? e.message : String(e);

      const latencyMs = performance.now() - startTime;

      results.push({
        algorithm: meta.id,
        outputType,
        model: null,
        latencyMs,
        quality: { fitness: 0, precision: 0, generalization: 0, simplicity: 0 },
        crashed: true,
        error,
      });

      if (config.verbose) {
        console.log(`❌ ${meta.id}: CRASHED — ${error}`);
      }
    }
  }

  // Summarize quality
  const summary = summarizeQuality(results);

  // Classify into tiers
  const registryMetadata = new Map(ALGORITHM_MANIFEST.map((m) => [m.id, m]));
  const classifications = classifyAll(results, registryMetadata);
  const tierSummary = summarizeTiers(classifications);

  // Save results
  const resultsFile = path.join(config.outputDir, `audit-results-${timestamp}.json`);
  fs.writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        timestamp,
        logFile: config.logPath,
        algorithm_results: results,
        quality_summary: summary,
        tier_classifications: classifications,
        tier_summary: tierSummary,
      },
      null,
      2
    )
  );

  if (config.verbose) {
    console.log(printTierSummary(tierSummary));
    console.log(`📁 Results saved to ${resultsFile}\n`);
  }

  return {
    results,
    summary,
    classifications,
    timestamp,
  };
}

/**
 * Run audit batch across multiple real datasets.
 * Small = quick feedback; Large = real 500K+ event stress test.
 */
export async function runAdversarialAuditBatch(
  wasm: any,
  datasetDir: string = './data',
  outputDir: string = './benchmarks/adversarial/results'
): Promise<Map<string, any>> {
  const batches = new Map<string, any>();

  const datasets = [
    { name: 'small', file: 'Sepsis Cases - Event Log.xes' },
    { name: 'large', file: 'Road_Traffic_Fine_Management_Process.xes' },
  ];

  for (const { name, file } of datasets) {
    const logPath = path.join(datasetDir, file);
    if (!fs.existsSync(logPath)) {
      console.warn(`⏭️  Dataset not found: ${logPath} (skipping)`);
      continue;
    }

    console.log(`\n🚀 Running audit on ${name} dataset (${file})...\n`);

    const result = await runAdversarialAudit(wasm, {
      ...DEFAULT_AUDIT_CONFIG,
      logPath,
      outputDir,
      verbose: true,
    });

    batches.set(name, result);
  }

  return batches;
}
