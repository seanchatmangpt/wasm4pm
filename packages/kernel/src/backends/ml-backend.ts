/**
 * ml-backend.ts
 *
 * ML backend implementation for machine learning-based process analysis.
 * 6 algorithms: classify, cluster, forecast, anomaly, regress, pca
 * Low-ms latency with deterministic=false.
 *
 * Spec reference: Section 3.3 (MlBackend declaration)
 */

import * as wasm from 'wasm4pm';
import type {
  MiningBackend,
  BackendCapabilities,
  EventLogIR,
  ModelIR,
  ResultEnvelope,
  BudgetEnvelope,
  ConformanceResult,
  AnalysisTask,
  ProvenanceChain,
  LatencyClass,
} from '../mining-backend.js';

const SUPPORTED_ALGORITHM_IDS = [
  'ml_classify',
  'ml_cluster',
  'ml_forecast',
  'ml_anomaly',
  'ml_regress',
  'ml_pca',
];

function deriveLatencyClass(estimatedDurationMs: number): LatencyClass {
  if (estimatedDurationMs < 1) return 'sub_ms';
  if (estimatedDurationMs < 100) return 'low_ms';
  if (estimatedDurationMs < 10000) return 'high_ms';
  return 'seconds';
}

export class MlBackend implements MiningBackend {
  readonly id = 'ml';
  private initialized = false;

  async init(): Promise<void> {
    try {
      await import('@wasm4pm/ml');
      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize ML backend:', e);
    }
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  isReady(): boolean {
    return this.initialized;
  }

  capabilities(): BackendCapabilities {
    return {
      algorithmFamilies: ['ml', 'analysis'],
      outputTypes: ['ml_result'],
      environment: {
        browserSafe: true,
        edgeSafe: true,
        requiresPython: false,
        requiresNetwork: false,
      },
      latencyClass: 'low_ms',
      deterministic: false,
      maxQualityTier: 'quality',
      supportedAlgorithmIds: SUPPORTED_ALGORITHM_IDS,
      maxConcurrentInvocations: 4,
    };
  }

  async discover(
    log: EventLogIR,
    algorithmId: string,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ModelIR>> {
    throw new Error(
      'MlBackend does not support model discovery directly. Use analyze() for ML tasks.'
    );
  }

  async conformance(
    log: EventLogIR,
    model: ModelIR,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ConformanceResult>> {
    throw new Error('MlBackend does not support conformance checking directly.');
  }

  async analyze(
    log: EventLogIR,
    task: AnalysisTask,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<unknown>> {
    const startMs = Date.now();

    try {
      if (!SUPPORTED_ALGORITHM_IDS.includes(task.task_type)) {
        throw new Error(`Analysis task ${task.task_type} not supported by ML backend`);
      }

      const ml = await import('@wasm4pm/ml');
      const logJson = JSON.stringify(log);
      const logHandle = wasm.load_eventlog_from_json(logJson);

      let resultRaw: any;
      const params = (task.parameters as Record<string, any>) || {};

      switch (task.task_type) {
        case 'ml_classify': {
          const configJson = JSON.stringify({
            features: params.features || ['trace_length', 'elapsed_time'],
            target: params.target || 'outcome',
          });
          const rawFeatures = wasm.extract_case_features(
            logHandle,
            'concept:name',
            'time:timestamp',
            configJson
          );
          const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
          resultRaw = await ml.classifyTraces(features, {
            method: params.method || 'knn',
            k: params.k ?? 5,
          });
          break;
        }
        case 'ml_cluster': {
          const configJson = JSON.stringify({
            features: params.features || ['trace_length', 'elapsed_time'],
          });
          const rawFeatures = wasm.extract_case_features(
            logHandle,
            'concept:name',
            'time:timestamp',
            configJson
          );
          const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
          resultRaw = await ml.clusterTraces(features, {
            method: params.method || 'kmeans',
            k: params.k ?? 3,
          });
          break;
        }
        case 'ml_forecast': {
          const driftRaw = wasm.detect_drift(logHandle, 'concept:name', params.window_size ?? 5);
          const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
          const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
          resultRaw = await ml.forecastThroughput(distances, {
            forecastPeriods: params.forecast_periods ?? 5,
          });
          break;
        }
        case 'ml_anomaly': {
          const driftRaw = wasm.detect_drift(logHandle, 'concept:name', params.window_size ?? 10);
          const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
          const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
          resultRaw = await ml.detectEnhancedAnomalies(distances, {
            smoothingMethod: (params.smoothing_method as 'sma' | 'ema') ?? 'sma',
          });
          break;
        }
        case 'ml_regress': {
          const configJson = JSON.stringify({
            features: params.features || [
              'trace_length',
              'elapsed_time',
              'rework_count',
              'unique_activities',
              'avg_inter_event_time',
            ],
            target: params.target_key || 'remaining_time',
          });
          const rawFeatures = wasm.extract_case_features(
            logHandle,
            'concept:name',
            'time:timestamp',
            configJson
          );
          const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
          resultRaw = await ml.regressRemainingTime(features, {
            method: params.method as any,
          });
          break;
        }
        case 'ml_pca': {
          const configJson = JSON.stringify({
            features: params.features || [
              'trace_length',
              'elapsed_time',
              'activity_counts',
              'rework_count',
              'unique_activities',
              'avg_inter_event_time',
            ],
          });
          const rawFeatures = wasm.extract_case_features(
            logHandle,
            'concept:name',
            'time:timestamp',
            configJson
          );
          const features = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
          resultRaw = await ml.reduceFeaturesPCA(features, {
            nComponents: params.n_components ?? 2,
          });
          break;
        }
        default:
          throw new Error(
            `Execution for ML task ${task.task_type} not implemented in ML backend bridge`
          );
      }

      const latency_ms = Date.now() - startMs;

      return {
        run_id: this.generateUuid(),
        status: 'success',
        payload: resultRaw,
        latency_ms,
        latency_class: deriveLatencyClass(latency_ms),
        backend_id: this.id,
        invocation_id: this.generateUuid(),
        cycle_seq: 0,
        algorithm_id: task.task_type,
        provenance: this.createProvenance(task.task_type),
        stale: false,
      };
    } catch (error) {
      return this.createFailedResult(task.task_type, startMs, String(error)) as any;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms: number; detail?: string }> {
    const startMs = Date.now();
    try {
      const ml = await import('@wasm4pm/ml');
      return {
        healthy: !!ml,
        latency_ms: Date.now() - startMs,
        detail: 'ML subsystem (@wasm4pm/ml) available',
      };
    } catch (error) {
      return {
        healthy: false,
        latency_ms: Date.now() - startMs,
        detail: `ML health check failed: ${error}`,
      };
    }
  }

  private generateUuid(): string {
    return crypto.randomUUID?.() || `uuid-${Date.now()}-${Math.random()}`;
  }

  private createProvenance(algorithmId: string): ProvenanceChain {
    return {
      input_hash: `hash-input-${algorithmId}`,
      config_hash: `hash-config-${algorithmId}`,
      plan_hash: `hash-plan-${algorithmId}`,
      output_hash: `hash-output-${algorithmId}`,
      combined_hash: `hash-combined-${algorithmId}`,
      algorithm_id: algorithmId,
      algorithm_version: '1.0',
      backend_id: this.id,
      kernel_version: '26.4.23',
      wasm_build_hash: 'stable',
    };
  }

  private createFailedResult(
    algorithmId: string,
    startMs: number,
    errorMessage: string
  ): ResultEnvelope<null> {
    const latency_ms = Date.now() - startMs;
    return {
      run_id: this.generateUuid(),
      status: 'failed',
      payload: null,
      error: errorMessage,
      latency_ms,
      latency_class: deriveLatencyClass(latency_ms),
      backend_id: this.id,
      invocation_id: this.generateUuid(),
      cycle_seq: 0,
      algorithm_id: algorithmId,
      provenance: this.createProvenance(algorithmId),
      stale: false,
    };
  }
}
