/**
 * Instrumentation utilities for distributed tracing
 * Provides helpers for creating spans, events, and correlating distributed requests
 * Per PRD §18.2-3: Required OTEL attributes and W3C Trace Context
 */
/**
 * Instrumentation helper for creating OTEL spans and events
 */
export class Instrumentation {
    /**
     * Create a state change event with OTEL span
     */
    static createStateChangeEvent(traceId, fromState, toState, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000; // nanoseconds
        const event = {
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
        const otelEvent = {
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
    static createPlanGeneratedEvent(traceId, planId, planHash, steps, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
     * Create algorithm started event
     */
    static createAlgorithmStartedEvent(traceId, algorithmName, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create algorithm completed event
     */
    static createAlgorithmCompletedEvent(traceId, spanId, algorithmName, requiredAttrs, options) {
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
    static createSourceStartedEvent(traceId, sourceKind, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
    static createSourceCompletedEvent(traceId, spanId, sourceKind, requiredAttrs, options) {
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
    static createSinkStartedEvent(traceId, sinkKind, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
    static createSinkCompletedEvent(traceId, spanId, sinkKind, requiredAttrs, options) {
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
    static createProgressEvent(traceId, progress, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const event = {
            type: 'Progress',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            progress,
            message: options?.message,
            requiredAttrs,
        };
        const jsonEvent = {
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
    static createErrorEvent(traceId, errorCode, errorMessage, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const severity = options?.severity || 'error';
        const event = {
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
        const otelEvent = {
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
        const jsonEvent = {
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
    static createMlAnalysisStartedEvent(traceId, mlTask, method, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
    static createMlAnalysisCompletedEvent(traceId, spanId, mlTask, method, requiredAttrs, options) {
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
    static createRlAgentDecisionEvent(traceId, decision, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const actionStr = String(decision.actionSelected);
        const event = {
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
        const otelEvent = {
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
    static createRlPolicyUpdateEvent(traceId, update, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const terminal = update.terminal ?? false;
        const event = {
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
        const otelEvent = {
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
    static createRlAgentSwitchEvent(traceId, fromAgent, toAgent, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
    static createPredictionTaskStartedEvent(traceId, predictionTask, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const taskNorm = predictionTask.replace(/-/g, '_');
        const event = {
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
        const otelEvent = {
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
    static createPredictionTaskCompletedEvent(traceId, spanId, predictionTask, requiredAttrs, options) {
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
    static createDriftCheckStartedEvent(traceId, driftMethod, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
    static createDriftCheckCompletedEvent(traceId, spanId, driftMethod, requiredAttrs, options) {
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
    static createConformanceCheckStartedEvent(traceId, method, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
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
        const otelEvent = {
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
     */
    static createConformanceCheckCompletedEvent(traceId, spanId, method, requiredAttrs, options) {
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
                ...(options?.fitness !== undefined && { 'conformance.fitness': options.fitness }),
                ...(options?.precision !== undefined && {
                    'conformance.precision': options.precision,
                }),
                ...(options?.generalization !== undefined && {
                    'conformance.generalization': options.generalization,
                }),
                ...(options?.simplicity !== undefined && {
                    'conformance.simplicity': options.simplicity,
                }),
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
    static async instrumentMlExecution(traceId, mlTask, method, requiredAttrs, fn, emit, options) {
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
        }
        catch {
            /* never block on OTEL */
        }
        const t0 = Date.now();
        let result;
        try {
            result = await fn();
        }
        catch (err) {
            const completeErr = this.createMlAnalysisCompletedEvent(traceId, start.event.spanId, mlTask, method, requiredAttrs, {
                status: 'ERROR',
                durationMs: Date.now() - t0,
            });
            completeErr.status = {
                code: 'ERROR',
                message: err instanceof Error ? err.message : String(err),
            };
            try {
                emit(completeErr);
            }
            catch {
                /* never block on OTEL */
            }
            throw err; // fail-fast
        }
        const complete = this.createMlAnalysisCompletedEvent(traceId, start.event.spanId, mlTask, method, requiredAttrs, {
            status: 'OK',
            durationMs: Date.now() - t0,
        });
        try {
            emit(complete);
        }
        catch {
            /* never block on OTEL */
        }
        return result;
    }
    /**
     * Generate a W3C-compliant span ID (16 hex chars)
     */
    static generateSpanId() {
        return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    /**
     * Generate a W3C-compliant trace ID (32 hex chars)
     */
    static generateTraceId() {
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    /**
     * Extract trace ID from W3C Trace Context header
     * Format: traceparent: 00-{trace-id}-{span-id}-{trace-flags}
     */
    static extractTraceContext(traceparentHeader) {
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
    static createTraceContextHeader(traceId, spanId, traceSampled = true) {
        const traceFlags = traceSampled ? '01' : '00';
        return `00-${traceId}-${spanId}-${traceFlags}`;
    }
}
