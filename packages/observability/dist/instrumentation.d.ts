/**
 * Instrumentation utilities for distributed tracing
 * Provides helpers for creating spans, events, and correlating distributed requests
 * Per PRD §18.2-3: Required OTEL attributes and W3C Trace Context
 */
import { OtelEvent, RequiredOtelAttributes, JsonEvent } from './types.js';
/**
 * Event types emitted by the engine
 */
export type EventType = 'StateChange' | 'PlanGenerated' | 'AlgorithmStarted' | 'AlgorithmCompleted' | 'SourceStarted' | 'SourceCompleted' | 'SinkStarted' | 'SinkCompleted' | 'Progress' | 'Error' | 'RecoveryStarted' | 'RecoveryCompleted' | 'MlModelTraining' | 'MlPredictionMade' | 'MlFeatureExtraction' | 'MlAnomalyDetected' | 'RlAgentDecision' | 'RlPolicyUpdate' | 'RlAgentSwitch' | 'PredictionTaskStarted' | 'PredictionTaskCompleted' | 'DriftCheckStarted' | 'DriftCheckCompleted' | 'DriftDetected' | 'ConformanceCheckStarted' | 'ConformanceCheckCompleted';
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
    progress: number;
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
    predictionTask: string;
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
    driftMethod: string;
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
        inputTraceCount?: number;
        inputEventCount?: number;
        parameterK?: number;
        parameterEps?: number;
        parameterNComponents?: number;
        parameterForecastPeriods?: number;
        cpuDurationNs?: number;
        wallDurationNs?: number;
    };
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Instrumentation helper for creating OTEL spans and events
 */
export declare class Instrumentation {
    /**
     * Create a state change event with OTEL span
     */
    static createStateChangeEvent(traceId: string, fromState: string, toState: string, requiredAttrs: RequiredOtelAttributes, options?: {
        reason?: string;
        parentSpanId?: string;
    }): {
        event: StateChangeEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create a plan generated event with OTEL span
     */
    static createPlanGeneratedEvent(traceId: string, planId: string, planHash: string, steps: number, requiredAttrs: RequiredOtelAttributes, options?: {
        estimatedDurationMs?: number;
        parentSpanId?: string;
    }): {
        event: PlanGeneratedEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create algorithm started event
     */
    static createAlgorithmStartedEvent(traceId: string, algorithmName: string, requiredAttrs: RequiredOtelAttributes, options?: {
        stepId?: string;
        parentSpanId?: string;
    }): {
        event: AlgorithmEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create algorithm completed event
     */
    static createAlgorithmCompletedEvent(traceId: string, spanId: string, algorithmName: string, requiredAttrs: RequiredOtelAttributes, options?: {
        status?: 'OK' | 'ERROR';
        errorCode?: string;
        errorMessage?: string;
        durationMs?: number;
        stepId?: string;
    }): OtelEvent;
    /**
     * Create source started event
     */
    static createSourceStartedEvent(traceId: string, sourceKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: IOEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create source completed event
     */
    static createSourceCompletedEvent(traceId: string, spanId: string, sourceKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        recordCount?: number;
        status?: 'OK' | 'ERROR';
        errorMessage?: string;
        durationMs?: number;
    }): OtelEvent;
    /**
     * Create sink started event
     */
    static createSinkStartedEvent(traceId: string, sinkKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: IOEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create sink completed event
     */
    static createSinkCompletedEvent(traceId: string, spanId: string, sinkKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        recordCount?: number;
        status?: 'OK' | 'ERROR';
        errorMessage?: string;
        durationMs?: number;
    }): OtelEvent;
    /**
     * Create progress event
     */
    static createProgressEvent(traceId: string, progress: number, requiredAttrs: RequiredOtelAttributes, options?: {
        message?: string;
        parentSpanId?: string;
    }): {
        event: ProgressEvent;
        jsonEvent: JsonEvent;
    };
    /**
     * Create error event
     */
    static createErrorEvent(traceId: string, errorCode: string, errorMessage: string, requiredAttrs: RequiredOtelAttributes, options?: {
        severity?: 'info' | 'warning' | 'error' | 'fatal';
        context?: Record<string, any>;
        parentSpanId?: string;
    }): {
        event: ErrorEventData;
        otelEvent: OtelEvent;
        jsonEvent: JsonEvent;
    };
    /**
     * Create ML analysis started event with OTEL span
     */
    static createMlAnalysisStartedEvent(traceId: string, mlTask: string, method: string, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: MlAnalysisEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create ML analysis completed event
     */
    static createMlAnalysisCompletedEvent(traceId: string, spanId: string, mlTask: string, method: string, requiredAttrs: RequiredOtelAttributes, options?: {
        status?: 'OK' | 'ERROR';
        durationMs?: number;
        mlAttributes?: MlAnalysisEvent['mlAttributes'];
    }): OtelEvent;
    /**
     * Create RL agent decision event with OTEL span.
     * Span name: `rl.agent.decision`. Status set to OK on construction (sync).
     */
    static createRlAgentDecisionEvent(traceId: string, decision: {
        agentType: string;
        agentId: string;
        actionSelected: string | number;
        stateHealthLevel: number;
        stateCircuitState: string;
        epsilon?: number;
        isExplore?: boolean;
        durationMs?: number;
    }, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: RlAgentDecisionEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create RL policy update event (Q-learning / TD update).
     * Span name: `rl.policy.update`.
     */
    static createRlPolicyUpdateEvent(traceId: string, update: {
        agentType: string;
        agentId: string;
        reward: number;
        tdError: number;
        qBefore: number;
        qAfter: number;
        terminal?: boolean;
        durationMs?: number;
    }, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: RlPolicyUpdateEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create RL agent switch event (LinUCB selection).
     * Span name: `rl.agent.switch`.
     */
    static createRlAgentSwitchEvent(traceId: string, fromAgent: string, toAgent: string, requiredAttrs: RequiredOtelAttributes, options?: {
        ucbScore?: number;
        cycleCount?: number;
        parentSpanId?: string;
    }): {
        event: RlAgentSwitchEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create prediction-task started event.
     * Span name: `prediction.<task>` (e.g. `prediction.next_activity`).
     */
    static createPredictionTaskStartedEvent(traceId: string, predictionTask: string, requiredAttrs: RequiredOtelAttributes, options?: {
        inputTraceCount?: number;
        inputEventCount?: number;
        topK?: number;
        ngramOrder?: number;
        parentSpanId?: string;
    }): {
        event: PredictionTaskEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create prediction-task completed event.
     */
    static createPredictionTaskCompletedEvent(traceId: string, spanId: string, predictionTask: string, requiredAttrs: RequiredOtelAttributes, options?: {
        outputPredictionCount?: number;
        durationMs?: number;
        status?: 'OK' | 'ERROR';
        errorCode?: string;
        errorMessage?: string;
    }): OtelEvent;
    /**
     * Create drift-check started event. Span name: `drift.check`.
     */
    static createDriftCheckStartedEvent(traceId: string, driftMethod: string, requiredAttrs: RequiredOtelAttributes, options?: {
        windowSize?: number;
        threshold?: number;
        parentSpanId?: string;
    }): {
        event: DriftCheckEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create drift-check completed event. Sets `drift.detected` and `drift.score`.
     */
    static createDriftCheckCompletedEvent(traceId: string, spanId: string, driftMethod: string, requiredAttrs: RequiredOtelAttributes, options?: {
        driftScore?: number;
        driftDetected?: boolean;
        durationMs?: number;
        status?: 'OK' | 'ERROR';
    }): OtelEvent;
    /**
     * Create conformance-check started event. Span name: `conformance.check`.
     */
    static createConformanceCheckStartedEvent(traceId: string, method: string, requiredAttrs: RequiredOtelAttributes, options?: {
        modelKind?: string;
        traceCount?: number;
        parentSpanId?: string;
    }): {
        event: ConformanceCheckEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create conformance-check completed event with quality metrics.
     */
    static createConformanceCheckCompletedEvent(traceId: string, spanId: string, method: string, requiredAttrs: RequiredOtelAttributes, options?: {
        fitness?: number;
        precision?: number;
        generalization?: number;
        simplicity?: number;
        durationMs?: number;
        status?: 'OK' | 'ERROR';
        errorCode?: string;
        errorMessage?: string;
    }): OtelEvent;
    /**
     * Wrap an async ML/RL operation with start/complete spans.
     * Non-blocking: span emission happens via `emit` (queue with drop-oldest
     * is the responsibility of the caller's exporter).
     *
     * If `fn` throws, an ERROR-status completion span is emitted and the
     * error is re-thrown (fail-fast per Toyota Production System rules).
     */
    static instrumentMlExecution<T>(traceId: string, mlTask: string, method: string, requiredAttrs: RequiredOtelAttributes, fn: () => Promise<T>, emit: (event: OtelEvent) => void, options?: {
        parentSpanId?: string;
        inputAttributes?: MlAnalysisEvent['mlAttributes'];
    }): Promise<T>;
    /**
     * Generate a W3C-compliant span ID (16 hex chars)
     */
    static generateSpanId(): string;
    /**
     * Generate a W3C-compliant trace ID (32 hex chars)
     */
    static generateTraceId(): string;
    /**
     * Extract trace ID from W3C Trace Context header
     * Format: traceparent: 00-{trace-id}-{span-id}-{trace-flags}
     */
    static extractTraceContext(traceparentHeader?: string): {
        traceId?: string;
        spanId?: string;
        traceFlags?: string;
    };
    /**
     * Create W3C Trace Context header
     */
    static createTraceContextHeader(traceId: string, spanId: string, traceSampled?: boolean): string;
}
//# sourceMappingURL=instrumentation.d.ts.map