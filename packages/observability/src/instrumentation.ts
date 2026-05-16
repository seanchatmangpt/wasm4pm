/**
 * Instrumentation utilities for distributed tracing
 * Provides helpers for creating spans, events, and correlating distributed requests
 * Per PRD §18.2-3: Required OTEL attributes and W3C Trace Context
 */

import { OtelEvent, RequiredOtelAttributes, JsonEvent } from './types.js';

/**
 * Event types emitted by the engine
 */
export type EventType =
  | 'StateChange'
  | 'PlanGenerated'
  | 'AlgorithmStarted'
  | 'AlgorithmCompleted'
  | 'SourceStarted'
  | 'SourceCompleted'
  | 'SinkStarted'
  | 'SinkCompleted'
  | 'Progress'
  | 'Error'
  | 'RecoveryStarted'
  | 'RecoveryCompleted'
  // ML events
  | 'MlModelTraining'
  | 'MlPredictionMade'
  | 'MlFeatureExtraction'
  | 'MlAnomalyDetected'
  // RL events
  | 'RlAgentDecision'
  | 'RlPolicyUpdate'
  | 'RlAgentSwitch'
  // Prediction events
  | 'PredictionTaskStarted'
  | 'PredictionTaskCompleted'
  // Drift events
  | 'DriftCheckStarted'
  | 'DriftCheckCompleted'
  | 'DriftDetected'
  // Conformance events
  | 'ConformanceCheckStarted'
  | 'ConformanceCheckCompleted';

/**
 * State change event
 */
export interface StateChangeEvent {
  type: 'StateChange';
  traceId: string;
  spanId: string;
  runId: string;
  fromState: string;
  toState: string;
  reason?: string;
  durationMs: number;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Plan generated event
 */
export interface PlanGeneratedEvent {
  type: 'PlanGenerated';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  planId: string;
  planHash: string;
  steps: number;
  estimatedDurationMs?: number;
  durationMs: number;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Algorithm event
 */
export interface AlgorithmEvent {
  type: 'AlgorithmStarted' | 'AlgorithmCompleted';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  algorithmName: string;
  stepId?: string;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  errorCode?: string;
  errorMessage?: string;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Source/Sink event
 */
export interface IOEvent {
  type: 'SourceStarted' | 'SourceCompleted' | 'SinkStarted' | 'SinkCompleted';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  operationType: 'source' | 'sink';
  kind: string;
  recordCount?: number;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  errorCode?: string;
  errorMessage?: string;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Progress event
 */
export interface ProgressEvent {
  type: 'Progress';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  progress: number; // 0-100
  message?: string;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Error event
 */
export interface ErrorEventData {
  type: 'Error';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  errorCode: string;
  errorMessage: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  context?: Record<string, any>;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * RL agent decision event — emitted every time an RL agent selects an action.
 *
 * Span name: `rl.agent.decision`
 * Span kind: INTERNAL
 *
 * Required attributes (in addition to RequiredOtelAttributes):
 *   rl.agent.type           — QLearning | SARSA | DoubleQLearning | ExpectedSARSA | REINFORCE
 *   rl.agent.id             — stable identifier for this agent instance
 *   rl.action.selected      — index or name of action chosen
 *   rl.state.health_level   — 0..4
 *   rl.state.circuit_state  — Closed | HalfOpen | Open
 *   rl.exploration.epsilon  — current ε for ε-greedy (if applicable)
 *   rl.exploration.is_explore — true if action was exploratory
 */
export interface RlAgentDecisionEvent {
  type: 'RlAgentDecision';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  agentType: string;
  agentId: string;
  actionSelected: string;
  stateHealthLevel: number;
  stateCircuitState: string;
  epsilon?: number;
  isExplore?: boolean;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * RL policy update event — emitted on every Q-learning / TD update.
 *
 * Span name: `rl.policy.update`
 * Span kind: INTERNAL
 *
 * Required attributes:
 *   rl.agent.type            — QLearning | SARSA | etc.
 *   rl.update.reward         — scalar reward signal
 *   rl.update.td_error       — temporal difference error
 *   rl.update.q_before       — Q(s,a) before update
 *   rl.update.q_after        — Q(s,a) after update
 *   rl.update.terminal       — true if next state is terminal
 *   rl.convergence.delta     — |q_after - q_before|
 */
export interface RlPolicyUpdateEvent {
  type: 'RlPolicyUpdate';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  agentType: string;
  agentId: string;
  reward: number;
  tdError: number;
  qBefore: number;
  qAfter: number;
  terminal: boolean;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * RL agent switch event — emitted when LinUCB selects a different agent.
 *
 * Span name: `rl.agent.switch`
 */
export interface RlAgentSwitchEvent {
  type: 'RlAgentSwitch';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  fromAgent: string;
  toAgent: string;
  ucbScore?: number;
  cycleCount?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Prediction task event — one of 6 perspectives:
 *   next-activity, remaining-time, outcome, drift, features, resource
 *
 * Span name: `prediction.<task>`
 * Span kind: INTERNAL
 */
export interface PredictionTaskEvent {
  type: 'PredictionTaskStarted' | 'PredictionTaskCompleted';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  predictionTask: string; // e.g. 'next_activity', 'remaining_time'
  inputTraceCount?: number;
  inputEventCount?: number;
  outputPredictionCount?: number;
  topK?: number;
  ngramOrder?: number;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  errorCode?: string;
  errorMessage?: string;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Drift detection event.
 *
 * Span name: `drift.check`
 * Span kind: INTERNAL
 */
export interface DriftCheckEvent {
  type: 'DriftCheckStarted' | 'DriftCheckCompleted' | 'DriftDetected';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  driftMethod: string; // 'ewma' | 'jaccard_window' | 'cusum' | etc.
  windowSize?: number;
  driftScore?: number;
  threshold?: number;
  driftDetected?: boolean;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Conformance check event.
 *
 * Span name: `conformance.check`
 * Span kind: INTERNAL
 *
 * Required attributes:
 *   conformance.method        — 'token_replay' | 'alignments'
 *   conformance.fitness       — 0..1
 *   conformance.precision     — 0..1
 *   conformance.generalization — 0..1
 *   conformance.simplicity    — 0..1
 */
export interface ConformanceCheckEvent {
  type: 'ConformanceCheckStarted' | 'ConformanceCheckCompleted';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  conformanceMethod: string;
  modelKind?: string;
  fitness?: number;
  precision?: number;
  generalization?: number;
  simplicity?: number;
  traceCount?: number;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  errorCode?: string;
  errorMessage?: string;
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * ML analysis event
 */
export interface MlAnalysisEvent {
  type: 'MlModelTraining' | 'MlPredictionMade' | 'MlFeatureExtraction' | 'MlAnomalyDetected';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  mlTask: string;
  method?: string;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  mlAttributes?: {
    modelType?: string;
    confidence?: number;
    featureCount?: number;
    clusterCount?: number;
    anomalyCount?: number;
    rSquared?: number;
    explainedVariance?: number[];
    // Standardized input attributes for ML spans
    inputTraceCount?: number;
    inputEventCount?: number;
    parameterK?: number;
    parameterEps?: number;
    parameterNComponents?: number;
    parameterForecastPeriods?: number;
    // CPU vs wall-clock time (nanoseconds)
    cpuDurationNs?: number;
    wallDurationNs?: number;
  };
  requiredAttrs: RequiredOtelAttributes;
}

/**
 * Instrumentation helper for creating OTEL spans and events
 */
export class Instrumentation {
  /**
   * Create a state change event with OTEL span
   */
  static createStateChangeEvent(
    traceId: string,
    fromState: string,
    toState: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { reason?: string; parentSpanId?: string }
  ): { event: StateChangeEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000; // nanoseconds

    const event: StateChangeEvent = {
      type: 'StateChange',
      traceId,
      spanId,
      runId: requiredAttrs['run.id'],
      fromState,
      toState,
      reason: options?.reason,
      durationMs: 0,
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `engine.state_change`,
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'OK' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'state.from': fromState,
        'state.to': toState,
        'state.reason': options?.reason || 'unspecified',
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create a plan generated event with OTEL span
   */
  static createPlanGeneratedEvent(
    traceId: string,
    planId: string,
    planHash: string,
    steps: number,
    requiredAttrs: RequiredOtelAttributes,
    options?: { estimatedDurationMs?: number; parentSpanId?: string }
  ): { event: PlanGeneratedEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: PlanGeneratedEvent = {
      type: 'PlanGenerated',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      planId,
      planHash,
      steps,
      estimatedDurationMs: options?.estimatedDurationMs,
      durationMs: 0,
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `engine.plan_generated`,
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'OK' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'plan.id': planId,
        'plan.hash': planHash,
        'plan.steps': steps,
        'plan.estimated_duration_ms': options?.estimatedDurationMs || 0,
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create algorithm started event.
   *
   * Span name: `algorithm.<algorithmName>` (e.g. `algorithm.dfg`)
   * Span kind: INTERNAL
   *
   * Attributes emitted on the start span (in addition to RequiredOtelAttributes):
   *   algorithm.name       — canonical algorithm identifier
   *   algorithm.step_id    — plan step ID, 'unspecified' when unknown
   *   algorithm.profile    — execution profile (mirrors execution.profile from requiredAttrs)
   *
   * Callers MUST close the span by calling createAlgorithmCompletedEvent with the
   * returned spanId. Leaving the span open results in status 'UNSET' in the exporter.
   */
  static createAlgorithmStartedEvent(
    traceId: string,
    algorithmName: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { stepId?: string; parentSpanId?: string }
  ): { event: AlgorithmEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: AlgorithmEvent = {
      type: 'AlgorithmStarted',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      algorithmName,
      stepId: options?.stepId,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `algorithm.${algorithmName}`,
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'algorithm.name': algorithmName,
        'algorithm.step_id': options?.stepId || 'unspecified',
        'algorithm.profile': requiredAttrs['execution.profile'],
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create algorithm completed event
   */
  static createAlgorithmCompletedEvent(
    traceId: string,
    spanId: string,
    algorithmName: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      status?: 'OK' | 'ERROR';
      errorCode?: string;
      errorMessage?: string;
      durationMs?: number;
      stepId?: string;
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;

    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `algorithm.${algorithmName}`,
      kind: 'INTERNAL',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: {
        code: status,
        message: options?.errorMessage,
      },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'algorithm.name': algorithmName,
        'algorithm.step_id': options?.stepId || 'unspecified',
        'algorithm.duration_ms': options?.durationMs || 0,
        'algorithm.error_code': options?.errorCode || '',
      },
    };
  }

  /**
   * Create source started event
   */
  static createSourceStartedEvent(
    traceId: string,
    sourceKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: IOEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: IOEvent = {
      type: 'SourceStarted',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      operationType: 'source',
      kind: sourceKind,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `source.${sourceKind}`,
      kind: 'CLIENT',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'source.kind': sourceKind,
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create source completed event
   */
  static createSourceCompletedEvent(
    traceId: string,
    spanId: string,
    sourceKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      recordCount?: number;
      status?: 'OK' | 'ERROR';
      errorMessage?: string;
      durationMs?: number;
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `source.${sourceKind}`,
      kind: 'CLIENT',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: status, message: options?.errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'source.kind': sourceKind,
        'source.record_count': options?.recordCount || 0,
        'source.duration_ms': options?.durationMs || 0,
      },
    };
  }

  /**
   * Create sink started event
   */
  static createSinkStartedEvent(
    traceId: string,
    sinkKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: IOEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: IOEvent = {
      type: 'SinkStarted',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      operationType: 'sink',
      kind: sinkKind,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `sink.${sinkKind}`,
      kind: 'PRODUCER',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'sink.kind': sinkKind,
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create sink completed event
   */
  static createSinkCompletedEvent(
    traceId: string,
    spanId: string,
    sinkKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      recordCount?: number;
      status?: 'OK' | 'ERROR';
      errorMessage?: string;
      durationMs?: number;
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `sink.${sinkKind}`,
      kind: 'PRODUCER',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: status, message: options?.errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'sink.kind': sinkKind,
        'sink.record_count': options?.recordCount || 0,
        'sink.duration_ms': options?.durationMs || 0,
      },
    };
  }

  /**
   * Create progress event
   */
  static createProgressEvent(
    traceId: string,
    progress: number,
    requiredAttrs: RequiredOtelAttributes,
    options?: { message?: string; parentSpanId?: string }
  ): { event: ProgressEvent; jsonEvent: JsonEvent } {
    const spanId = this.generateSpanId();

    const event: ProgressEvent = {
      type: 'Progress',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      progress,
      message: options?.message,
      requiredAttrs,
    };

    const jsonEvent: JsonEvent = {
      timestamp: new Date().toISOString(),
      component: 'engine',
      event_type: 'progress',
      run_id: requiredAttrs['run.id'],
      data: {
        progress,
        message: options?.message || '',
        trace_id: traceId,
      },
    };

    return { event, jsonEvent };
  }

  /**
   * Create error event
   */
  static createErrorEvent(
    traceId: string,
    errorCode: string,
    errorMessage: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      severity?: 'info' | 'warning' | 'error' | 'fatal';
      context?: Record<string, any>;
      parentSpanId?: string;
    }
  ): { event: ErrorEventData; otelEvent: OtelEvent; jsonEvent: JsonEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;
    const severity = options?.severity || 'error';

    const event: ErrorEventData = {
      type: 'Error',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      errorCode,
      errorMessage,
      severity,
      context: options?.context,
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `error.${errorCode}`,
      kind: 'INTERNAL',
      start_time: now,
      end_time: now,
      status: { code: 'ERROR', message: errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'error.code': errorCode,
        'error.message': errorMessage,
        'error.severity': severity,
      },
      events: [
        {
          name: 'exception',
          timestamp: now,
          attributes: {
            'exception.type': errorCode,
            'exception.message': errorMessage,
          },
        },
      ],
    };

    const jsonEvent: JsonEvent = {
      timestamp: new Date().toISOString(),
      component: 'engine',
      event_type: 'error',
      run_id: requiredAttrs['run.id'],
      data: {
        error_code: errorCode,
        error_message: errorMessage,
        severity,
        context: options?.context || {},
        trace_id: traceId,
      },
    };

    return { event, otelEvent, jsonEvent };
  }

  /**
   * Create ML analysis started event with OTEL span
   */
  static createMlAnalysisStartedEvent(
    traceId: string,
    mlTask: string,
    method: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: MlAnalysisEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: MlAnalysisEvent = {
      type: 'MlModelTraining',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      mlTask,
      method,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `ml.${mlTask}`,
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'ml.task': mlTask,
        'ml.method': method,
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create ML analysis completed event
   */
  static createMlAnalysisCompletedEvent(
    traceId: string,
    spanId: string,
    mlTask: string,
    method: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      status?: 'OK' | 'ERROR';
      durationMs?: number;
      mlAttributes?: MlAnalysisEvent['mlAttributes'];
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `ml.${mlTask}`,
      kind: 'INTERNAL',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: status },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'ml.task': mlTask,
        'ml.method': method,
        'ml.duration_ms': options?.durationMs || 0,
        ...(options?.mlAttributes?.confidence !== undefined && {
          'ml.confidence': options.mlAttributes.confidence,
        }),
        ...(options?.mlAttributes?.featureCount !== undefined && {
          'ml.feature_count': options.mlAttributes.featureCount,
        }),
        ...(options?.mlAttributes?.clusterCount !== undefined && {
          'ml.cluster_count': options.mlAttributes.clusterCount,
        }),
        ...(options?.mlAttributes?.anomalyCount !== undefined && {
          'ml.anomaly_count': options.mlAttributes.anomalyCount,
        }),
        ...(options?.mlAttributes?.rSquared !== undefined && {
          'ml.r_squared': options.mlAttributes.rSquared,
        }),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  RL instrumentation
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Create RL agent decision event with OTEL span.
   * Span name: `rl.agent.decision`. Status set to OK on construction (sync).
   */
  static createRlAgentDecisionEvent(
    traceId: string,
    decision: {
      agentType: string;
      agentId: string;
      actionSelected: string | number;
      stateHealthLevel: number;
      stateCircuitState: string;
      epsilon?: number;
      isExplore?: boolean;
      durationMs?: number;
    },
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: RlAgentDecisionEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;
    const actionStr = String(decision.actionSelected);

    const event: RlAgentDecisionEvent = {
      type: 'RlAgentDecision',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      agentType: decision.agentType,
      agentId: decision.agentId,
      actionSelected: actionStr,
      stateHealthLevel: decision.stateHealthLevel,
      stateCircuitState: decision.stateCircuitState,
      epsilon: decision.epsilon,
      isExplore: decision.isExplore,
      durationMs: decision.durationMs,
      status: 'OK',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: 'rl.agent.decision',
      kind: 'INTERNAL',
      start_time: now - (decision.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: 'OK' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'rl.agent.type': decision.agentType,
        'rl.agent.id': decision.agentId,
        'rl.action.selected': actionStr,
        'rl.state.health_level': decision.stateHealthLevel,
        'rl.state.circuit_state': decision.stateCircuitState,
        ...(decision.epsilon !== undefined && { 'rl.exploration.epsilon': decision.epsilon }),
        ...(decision.isExplore !== undefined && {
          'rl.exploration.is_explore': decision.isExplore,
        }),
        'rl.decision.duration_ms': decision.durationMs || 0,
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create RL policy update event (Q-learning / TD update).
   * Span name: `rl.policy.update`.
   */
  static createRlPolicyUpdateEvent(
    traceId: string,
    update: {
      agentType: string;
      agentId: string;
      reward: number;
      tdError: number;
      qBefore: number;
      qAfter: number;
      terminal?: boolean;
      durationMs?: number;
    },
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: RlPolicyUpdateEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;
    const terminal = update.terminal ?? false;

    const event: RlPolicyUpdateEvent = {
      type: 'RlPolicyUpdate',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      agentType: update.agentType,
      agentId: update.agentId,
      reward: update.reward,
      tdError: update.tdError,
      qBefore: update.qBefore,
      qAfter: update.qAfter,
      terminal,
      durationMs: update.durationMs,
      status: 'OK',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: 'rl.policy.update',
      kind: 'INTERNAL',
      start_time: now - (update.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: 'OK' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'rl.agent.type': update.agentType,
        'rl.agent.id': update.agentId,
        'rl.update.reward': update.reward,
        'rl.update.td_error': update.tdError,
        'rl.update.q_before': update.qBefore,
        'rl.update.q_after': update.qAfter,
        'rl.update.terminal': terminal,
        'rl.convergence.delta': Math.abs(update.qAfter - update.qBefore),
        'rl.update.duration_ms': update.durationMs || 0,
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create RL agent switch event (LinUCB selection).
   * Span name: `rl.agent.switch`.
   */
  static createRlAgentSwitchEvent(
    traceId: string,
    fromAgent: string,
    toAgent: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { ucbScore?: number; cycleCount?: number; parentSpanId?: string }
  ): { event: RlAgentSwitchEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: RlAgentSwitchEvent = {
      type: 'RlAgentSwitch',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      fromAgent,
      toAgent,
      ucbScore: options?.ucbScore,
      cycleCount: options?.cycleCount,
      status: 'OK',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: 'rl.agent.switch',
      kind: 'INTERNAL',
      start_time: now,
      end_time: now,
      status: { code: 'OK' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'rl.agent.from': fromAgent,
        'rl.agent.to': toAgent,
        ...(options?.ucbScore !== undefined && { 'rl.linucb.score': options.ucbScore }),
        ...(options?.cycleCount !== undefined && { 'rl.cycle.count': options.cycleCount }),
      },
    };

    return { event, otelEvent };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Prediction instrumentation (6 perspectives)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Create prediction-task started event.
   * Span name: `prediction.<task>` (e.g. `prediction.next_activity`).
   */
  static createPredictionTaskStartedEvent(
    traceId: string,
    predictionTask: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      inputTraceCount?: number;
      inputEventCount?: number;
      topK?: number;
      ngramOrder?: number;
      parentSpanId?: string;
    }
  ): { event: PredictionTaskEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;
    const taskNorm = predictionTask.replace(/-/g, '_');

    const event: PredictionTaskEvent = {
      type: 'PredictionTaskStarted',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      predictionTask: taskNorm,
      inputTraceCount: options?.inputTraceCount,
      inputEventCount: options?.inputEventCount,
      topK: options?.topK,
      ngramOrder: options?.ngramOrder,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: `prediction.${taskNorm}`,
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'prediction.task': taskNorm,
        ...(options?.inputTraceCount !== undefined && {
          'prediction.input.trace_count': options.inputTraceCount,
        }),
        ...(options?.inputEventCount !== undefined && {
          'prediction.input.event_count': options.inputEventCount,
        }),
        ...(options?.topK !== undefined && { 'prediction.top_k': options.topK }),
        ...(options?.ngramOrder !== undefined && {
          'prediction.ngram_order': options.ngramOrder,
        }),
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create prediction-task completed event.
   */
  static createPredictionTaskCompletedEvent(
    traceId: string,
    spanId: string,
    predictionTask: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      outputPredictionCount?: number;
      durationMs?: number;
      status?: 'OK' | 'ERROR';
      errorCode?: string;
      errorMessage?: string;
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';
    const taskNorm = predictionTask.replace(/-/g, '_');

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `prediction.${taskNorm}`,
      kind: 'INTERNAL',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: status, message: options?.errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'prediction.task': taskNorm,
        'prediction.duration_ms': options?.durationMs || 0,
        ...(options?.outputPredictionCount !== undefined && {
          'prediction.output.count': options.outputPredictionCount,
        }),
        ...(options?.errorCode && { 'error.code': options.errorCode }),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Drift detection instrumentation
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Create drift-check started event. Span name: `drift.check`.
   */
  static createDriftCheckStartedEvent(
    traceId: string,
    driftMethod: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { windowSize?: number; threshold?: number; parentSpanId?: string }
  ): { event: DriftCheckEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: DriftCheckEvent = {
      type: 'DriftCheckStarted',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      driftMethod,
      windowSize: options?.windowSize,
      threshold: options?.threshold,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: 'drift.check',
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'drift.method': driftMethod,
        ...(options?.windowSize !== undefined && { 'drift.window_size': options.windowSize }),
        ...(options?.threshold !== undefined && { 'drift.threshold': options.threshold }),
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create drift-check completed event. Sets `drift.detected` and `drift.score`.
   */
  static createDriftCheckCompletedEvent(
    traceId: string,
    spanId: string,
    driftMethod: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      driftScore?: number;
      driftDetected?: boolean;
      durationMs?: number;
      status?: 'OK' | 'ERROR';
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: 'drift.check',
      kind: 'INTERNAL',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: status },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'drift.method': driftMethod,
        'drift.duration_ms': options?.durationMs || 0,
        ...(options?.driftScore !== undefined && { 'drift.score': options.driftScore }),
        ...(options?.driftDetected !== undefined && {
          'drift.detected': options.driftDetected,
        }),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Conformance instrumentation
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Create conformance-check started event. Span name: `conformance.check`.
   */
  static createConformanceCheckStartedEvent(
    traceId: string,
    method: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { modelKind?: string; traceCount?: number; parentSpanId?: string }
  ): { event: ConformanceCheckEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: ConformanceCheckEvent = {
      type: 'ConformanceCheckStarted',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      conformanceMethod: method,
      modelKind: options?.modelKind,
      traceCount: options?.traceCount,
      status: 'UNSET',
      requiredAttrs,
    };

    const otelEvent: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: options?.parentSpanId,
      name: 'conformance.check',
      kind: 'INTERNAL',
      start_time: now,
      status: { code: 'UNSET' },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'conformance.method': method,
        ...(options?.modelKind && { 'conformance.model_kind': options.modelKind }),
        ...(options?.traceCount !== undefined && {
          'conformance.trace_count': options.traceCount,
        }),
      },
    };

    return { event, otelEvent };
  }

  /**
   * Create conformance-check completed event with quality metrics.
   *
   * Span name: `conformance.check`
   * Span kind: INTERNAL
   *
   * Required attributes on a completed conformance span (Van der Aalst four dimensions):
   *   conformance.method        — 'token_replay' | 'alignments'
   *   conformance.fitness       — 0..1 (defaults to -1.0 when not measured)
   *   conformance.precision     — 0..1 (defaults to -1.0 when not measured)
   *   conformance.generalization — 0..1 (defaults to -1.0 when not measured)
   *   conformance.simplicity    — 0..1 (defaults to -1.0 when not measured)
   *   conformance.duration_ms   — wall-clock time for the check
   *
   * A value of -1.0 signals "not computed" and is distinguishable from a 0.0 score.
   * All four dimensions are always emitted so span queries never need null-checks.
   */
  static createConformanceCheckCompletedEvent(
    traceId: string,
    spanId: string,
    method: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      fitness?: number;
      precision?: number;
      generalization?: number;
      simplicity?: number;
      durationMs?: number;
      status?: 'OK' | 'ERROR';
      errorCode?: string;
      errorMessage?: string;
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: 'conformance.check',
      kind: 'INTERNAL',
      start_time: now - (options?.durationMs || 0) * 1000000,
      end_time: now,
      status: { code: status, message: options?.errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        ...requiredAttrs,
        'conformance.method': method,
        'conformance.duration_ms': options?.durationMs || 0,
        // Van der Aalst four quality dimensions — always emitted; -1.0 = not computed.
        'conformance.fitness': options?.fitness ?? -1,
        'conformance.precision': options?.precision ?? -1,
        'conformance.generalization': options?.generalization ?? -1,
        'conformance.simplicity': options?.simplicity ?? -1,
        ...(options?.errorCode && { 'error.code': options.errorCode }),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Generic non-blocking wrapper
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Wrap an async ML/RL operation with start/complete spans.
   * Non-blocking: span emission happens via `emit` (queue with drop-oldest
   * is the responsibility of the caller's exporter).
   *
   * If `fn` throws, an ERROR-status completion span is emitted and the
   * error is re-thrown (fail-fast per Toyota Production System rules).
   */
  static async instrumentMlExecution<T>(
    traceId: string,
    mlTask: string,
    method: string,
    requiredAttrs: RequiredOtelAttributes,
    fn: () => Promise<T>,
    emit: (event: OtelEvent) => void,
    options?: {
      parentSpanId?: string;
      inputAttributes?: MlAnalysisEvent['mlAttributes'];
    }
  ): Promise<T> {
    const start = this.createMlAnalysisStartedEvent(traceId, mlTask, method, requiredAttrs, {
      parentSpanId: options?.parentSpanId,
    });
    // Decorate the start span with input attributes if provided.
    if (options?.inputAttributes) {
      Object.assign(start.otelEvent.attributes, {
        ...(options.inputAttributes.inputTraceCount !== undefined && {
          'ml.input.trace_count': options.inputAttributes.inputTraceCount,
        }),
        ...(options.inputAttributes.inputEventCount !== undefined && {
          'ml.input.event_count': options.inputAttributes.inputEventCount,
        }),
        ...(options.inputAttributes.parameterK !== undefined && {
          'ml.parameter.k': options.inputAttributes.parameterK,
        }),
        ...(options.inputAttributes.parameterEps !== undefined && {
          'ml.parameter.eps': options.inputAttributes.parameterEps,
        }),
        ...(options.inputAttributes.parameterNComponents !== undefined && {
          'ml.parameter.n_components': options.inputAttributes.parameterNComponents,
        }),
        ...(options.inputAttributes.parameterForecastPeriods !== undefined && {
          'ml.parameter.forecast_periods': options.inputAttributes.parameterForecastPeriods,
        }),
      });
    }
    try {
      emit(start.otelEvent);
    } catch {
      /* never block on OTEL */
    }

    const t0 = Date.now();
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      const completeErr = this.createMlAnalysisCompletedEvent(
        traceId,
        start.event.spanId,
        mlTask,
        method,
        requiredAttrs,
        {
          status: 'ERROR',
          durationMs: Date.now() - t0,
        }
      );
      completeErr.status = {
        code: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
      };
      try {
        emit(completeErr);
      } catch {
        /* never block on OTEL */
      }
      throw err; // fail-fast
    }

    const complete = this.createMlAnalysisCompletedEvent(
      traceId,
      start.event.spanId,
      mlTask,
      method,
      requiredAttrs,
      {
        status: 'OK',
        durationMs: Date.now() - t0,
      }
    );
    try {
      emit(complete);
    } catch {
      /* never block on OTEL */
    }
    return result;
  }

  /**
   * Generate a W3C-compliant span ID (16 hex chars)
   */
  static generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Generate a W3C-compliant trace ID (32 hex chars)
   */
  static generateTraceId(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Extract trace ID from W3C Trace Context header
   * Format: traceparent: 00-{trace-id}-{span-id}-{trace-flags}
   */
  static extractTraceContext(traceparentHeader?: string): {
    traceId?: string;
    spanId?: string;
    traceFlags?: string;
  } {
    if (!traceparentHeader) {
      return {};
    }

    const parts = traceparentHeader.split('-');
    if (parts.length !== 4) {
      return {};
    }

    const [version, traceId, spanId, traceFlags] = parts;
    if (version !== '00') {
      return {};
    }

    return { traceId, spanId, traceFlags };
  }

  /**
   * Create W3C Trace Context header
   */
  static createTraceContextHeader(
    traceId: string,
    spanId: string,
    traceSampled: boolean = true
  ): string {
    const traceFlags = traceSampled ? '01' : '00';
    return `00-${traceId}-${spanId}-${traceFlags}`;
  }
}
