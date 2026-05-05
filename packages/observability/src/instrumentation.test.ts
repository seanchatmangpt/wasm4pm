/**
 * Tests for instrumentation module
 * Covers span creation, event generation, and trace context handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Instrumentation } from './instrumentation';
import { RequiredOtelAttributes } from './types';

describe('Instrumentation', () => {
  let traceId: string;
  let requiredAttrs: RequiredOtelAttributes;

  beforeEach(() => {
    traceId = Instrumentation.generateTraceId();
    requiredAttrs = {
      'run.id': 'test-run-123',
      'config.hash': 'abc123',
      'input.hash': 'def456',
      'plan.hash': 'ghi789',
      'execution.profile': 'test',
      'source.kind': 'test',
      'sink.kind': 'test',
    };
  });

  describe('Trace ID generation', () => {
    it('should generate valid W3C trace IDs', () => {
      const id = Instrumentation.generateTraceId();
      expect(id).toMatch(/^[a-f0-9]{32}$/);
      expect(id).toHaveLength(32);
    });

    it('should generate unique trace IDs', () => {
      const id1 = Instrumentation.generateTraceId();
      const id2 = Instrumentation.generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('Span ID generation', () => {
    it('should generate valid W3C span IDs', () => {
      const id = Instrumentation.generateSpanId();
      expect(id).toMatch(/^[a-f0-9]{16}$/);
      expect(id).toHaveLength(16);
    });

    it('should generate unique span IDs', () => {
      const id1 = Instrumentation.generateSpanId();
      const id2 = Instrumentation.generateSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('State change events', () => {
    it('should create state change event with required fields', () => {
      const { event, otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs
      );

      expect(event.type).toBe('StateChange');
      expect(event.traceId).toBe(traceId);
      expect(event.fromState).toBe('ready');
      expect(event.toState).toBe('planning');
      expect(event.runId).toBe(requiredAttrs['run.id']);

      expect(otelEvent.trace_id).toBe(traceId);
      expect(otelEvent.attributes['state.from']).toBe('ready');
      expect(otelEvent.attributes['state.to']).toBe('planning');
      expect(otelEvent.status?.code).toBe('OK');
    });

    it('should include parent span ID if provided', () => {
      const parentSpanId = Instrumentation.generateSpanId();
      const { otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs,
        { parentSpanId }
      );

      expect(otelEvent.parent_span_id).toBe(parentSpanId);
    });

    it('should include reason if provided', () => {
      const { event, otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs,
        { reason: 'User initiated planning' }
      );

      expect(event.reason).toBe('User initiated planning');
      expect(otelEvent.attributes['state.reason']).toBe('User initiated planning');
    });
  });

  describe('Plan generated events', () => {
    it('should create plan generated event with required fields', () => {
      const { event, otelEvent } = Instrumentation.createPlanGeneratedEvent(
        traceId,
        'plan-123',
        'hash-abc',
        5,
        requiredAttrs
      );

      expect(event.type).toBe('PlanGenerated');
      expect(event.planId).toBe('plan-123');
      expect(event.planHash).toBe('hash-abc');
      expect(event.steps).toBe(5);

      expect(otelEvent.attributes['plan.id']).toBe('plan-123');
      expect(otelEvent.attributes['plan.hash']).toBe('hash-abc');
      expect(otelEvent.attributes['plan.steps']).toBe(5);
    });

    it('should include estimated duration if provided', () => {
      const { event } = Instrumentation.createPlanGeneratedEvent(
        traceId,
        'plan-123',
        'hash-abc',
        5,
        requiredAttrs,
        { estimatedDurationMs: 1000 }
      );

      expect(event.estimatedDurationMs).toBe(1000);
    });
  });

  describe('Algorithm events', () => {
    it('should create algorithm started event', () => {
      const { event, otelEvent } = Instrumentation.createAlgorithmStartedEvent(
        traceId,
        'dijkstra',
        requiredAttrs
      );

      expect(event.type).toBe('AlgorithmStarted');
      expect(event.algorithmName).toBe('dijkstra');
      expect(otelEvent.name).toBe('algorithm.dijkstra');
      expect(otelEvent.attributes['algorithm.name']).toBe('dijkstra');
    });

    it('should create algorithm completed event', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        traceId,
        spanId,
        'dijkstra',
        requiredAttrs,
        { status: 'OK', durationMs: 100 }
      );

      expect(otelEvent.span_id).toBe(spanId);
      expect(otelEvent.status?.code).toBe('OK');
      expect(otelEvent.attributes['algorithm.duration_ms']).toBe(100);
    });

    it('should handle algorithm error', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        traceId,
        spanId,
        'dijkstra',
        requiredAttrs,
        {
          status: 'ERROR',
          errorCode: 'TIMEOUT',
          errorMessage: 'Algorithm timed out',
          durationMs: 5000,
        }
      );

      expect(otelEvent.status?.code).toBe('ERROR');
      expect(otelEvent.status?.message).toBe('Algorithm timed out');
      expect(otelEvent.attributes['algorithm.error_code']).toBe('TIMEOUT');
    });
  });

  describe('Source/Sink events', () => {
    it('should create source started event', () => {
      const { event, otelEvent } = Instrumentation.createSourceStartedEvent(
        traceId,
        'xes',
        requiredAttrs
      );

      expect(event.type).toBe('SourceStarted');
      expect(event.kind).toBe('xes');
      expect(otelEvent.kind).toBe('CLIENT');
      expect(otelEvent.attributes['source.kind']).toBe('xes');
    });

    it('should create source completed event', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createSourceCompletedEvent(
        traceId,
        spanId,
        'xes',
        requiredAttrs,
        { recordCount: 1000, status: 'OK', durationMs: 250 }
      );

      expect(otelEvent.status?.code).toBe('OK');
      expect(otelEvent.attributes['source.record_count']).toBe(1000);
      expect(otelEvent.attributes['source.duration_ms']).toBe(250);
    });

    it('should create sink started event', () => {
      const { event, otelEvent } = Instrumentation.createSinkStartedEvent(
        traceId,
        'petri_net',
        requiredAttrs
      );

      expect(event.type).toBe('SinkStarted');
      expect(event.kind).toBe('petri_net');
      expect(otelEvent.kind).toBe('PRODUCER');
      expect(otelEvent.attributes['sink.kind']).toBe('petri_net');
    });

    it('should create sink completed event', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createSinkCompletedEvent(
        traceId,
        spanId,
        'petri_net',
        requiredAttrs,
        { recordCount: 1, status: 'OK', durationMs: 50 }
      );

      expect(otelEvent.status?.code).toBe('OK');
      expect(otelEvent.attributes['sink.record_count']).toBe(1);
      expect(otelEvent.attributes['sink.duration_ms']).toBe(50);
    });
  });

  describe('Progress events', () => {
    it('should create progress event', () => {
      const { event, jsonEvent } = Instrumentation.createProgressEvent(traceId, 50, requiredAttrs, {
        message: 'Processing step 2 of 4',
      });

      expect(event.type).toBe('Progress');
      expect(event.progress).toBe(50);
      expect(event.message).toBe('Processing step 2 of 4');

      expect(jsonEvent.component).toBe('engine');
      expect(jsonEvent.event_type).toBe('progress');
      expect(jsonEvent.data.progress).toBe(50);
    });

    it('should handle 100% progress', () => {
      const { event } = Instrumentation.createProgressEvent(traceId, 100, requiredAttrs);

      expect(event.progress).toBe(100);
    });
  });

  describe('Error events', () => {
    it('should create error event with required fields', () => {
      const { event, otelEvent, jsonEvent } = Instrumentation.createErrorEvent(
        traceId,
        'BOOTSTRAP_FAILED',
        'Kernel initialization failed',
        requiredAttrs
      );

      expect(event.type).toBe('Error');
      expect(event.errorCode).toBe('BOOTSTRAP_FAILED');
      expect(event.errorMessage).toBe('Kernel initialization failed');
      expect(event.severity).toBe('error');

      expect(otelEvent.status?.code).toBe('ERROR');
      expect(otelEvent.status?.message).toBe('Kernel initialization failed');
      expect(otelEvent.attributes['error.code']).toBe('BOOTSTRAP_FAILED');

      expect(jsonEvent.component).toBe('engine');
      expect(jsonEvent.event_type).toBe('error');
      expect(jsonEvent.data.error_code).toBe('BOOTSTRAP_FAILED');
    });

    it('should include severity level', () => {
      const { event } = Instrumentation.createErrorEvent(
        traceId,
        'CRITICAL_ERROR',
        'Fatal error occurred',
        requiredAttrs,
        { severity: 'fatal' }
      );

      expect(event.severity).toBe('fatal');
    });

    it('should include error context', () => {
      const context = { failedComponent: 'kernel', retries: 3 };
      const { event } = Instrumentation.createErrorEvent(
        traceId,
        'RETRY_EXHAUSTED',
        'All retries failed',
        requiredAttrs,
        { context }
      );

      expect(event.context).toEqual(context);
    });
  });

  describe('Trace context propagation', () => {
    it('should create W3C Trace Context header', () => {
      const traceId = '00000000000000000000000000000001';
      const spanId = '0000000000000001';
      const header = Instrumentation.createTraceContextHeader(traceId, spanId, true);

      expect(header).toBe('00-00000000000000000000000000000001-0000000000000001-01');
    });

    it('should extract trace context from header', () => {
      const header = '00-12345678901234567890123456789012-1234567890123456-01';
      const context = Instrumentation.extractTraceContext(header);

      expect(context.traceId).toBe('12345678901234567890123456789012');
      expect(context.spanId).toBe('1234567890123456');
      expect(context.traceFlags).toBe('01');
    });

    it('should handle invalid trace context headers', () => {
      const context = Instrumentation.extractTraceContext('invalid');
      expect(context.traceId).toBeUndefined();
      expect(context.spanId).toBeUndefined();
    });

    it('should handle missing trace context', () => {
      const context = Instrumentation.extractTraceContext();
      expect(Object.keys(context)).toHaveLength(0);
    });
  });

  describe('Required OTEL attributes', () => {
    it('should include all required attributes in events', () => {
      const { otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs
      );

      expect(otelEvent.attributes['run.id']).toBe(requiredAttrs['run.id']);
      expect(otelEvent.attributes['config.hash']).toBe(requiredAttrs['config.hash']);
      expect(otelEvent.attributes['input.hash']).toBe(requiredAttrs['input.hash']);
      expect(otelEvent.attributes['plan.hash']).toBe(requiredAttrs['plan.hash']);
      expect(otelEvent.attributes['execution.profile']).toBe(requiredAttrs['execution.profile']);
      expect(otelEvent.attributes['source.kind']).toBe(requiredAttrs['source.kind']);
      expect(otelEvent.attributes['sink.kind']).toBe(requiredAttrs['sink.kind']);
    });
  });

  describe('Event metadata', () => {
    it('should preserve span hierarchy with parent span IDs', () => {
      const parentSpanId = Instrumentation.generateSpanId();
      const { otelEvent } = Instrumentation.createAlgorithmStartedEvent(
        traceId,
        'test_algo',
        requiredAttrs,
        { parentSpanId }
      );

      expect(otelEvent.parent_span_id).toBe(parentSpanId);
    });

    it('should include span kind indicators', () => {
      const sourceEvent = Instrumentation.createSourceStartedEvent(traceId, 'xes', requiredAttrs);
      const sinkEvent = Instrumentation.createSinkStartedEvent(traceId, 'petri_net', requiredAttrs);

      expect(sourceEvent.otelEvent.kind).toBe('CLIENT');
      expect(sinkEvent.otelEvent.kind).toBe('PRODUCER');
    });
  });

  // ───────────────────────── ML / RL / Prediction / Drift / Conformance ─────────

  describe('RL agent decision events', () => {
    it('should create rl.agent.decision span with required attributes', () => {
      const { event, otelEvent } = Instrumentation.createRlAgentDecisionEvent(
        traceId,
        {
          agentType: 'QLearning',
          agentId: 'agent-0',
          actionSelected: 3,
          stateHealthLevel: 1,
          stateCircuitState: 'Closed',
          epsilon: 0.1,
          isExplore: false,
          durationMs: 2,
        },
        requiredAttrs
      );

      expect(event.type).toBe('RlAgentDecision');
      expect(event.actionSelected).toBe('3');
      expect(otelEvent.name).toBe('rl.agent.decision');
      expect(otelEvent.kind).toBe('INTERNAL');
      expect(otelEvent.attributes['rl.agent.type']).toBe('QLearning');
      expect(otelEvent.attributes['rl.agent.id']).toBe('agent-0');
      expect(otelEvent.attributes['rl.action.selected']).toBe('3');
      expect(otelEvent.attributes['rl.state.health_level']).toBe(1);
      expect(otelEvent.attributes['rl.state.circuit_state']).toBe('Closed');
      expect(otelEvent.attributes['rl.exploration.epsilon']).toBe(0.1);
      expect(otelEvent.attributes['rl.exploration.is_explore']).toBe(false);
      expect(otelEvent.status?.code).toBe('OK');
    });

    it('should omit optional exploration fields when not provided', () => {
      const { otelEvent } = Instrumentation.createRlAgentDecisionEvent(
        traceId,
        {
          agentType: 'REINFORCE',
          agentId: 'agent-policy',
          actionSelected: 'noop',
          stateHealthLevel: 0,
          stateCircuitState: 'Open',
        },
        requiredAttrs
      );
      expect('rl.exploration.epsilon' in otelEvent.attributes).toBe(false);
      expect('rl.exploration.is_explore' in otelEvent.attributes).toBe(false);
    });
  });

  describe('RL policy update events', () => {
    it('should compute convergence delta = |q_after - q_before|', () => {
      const { otelEvent } = Instrumentation.createRlPolicyUpdateEvent(
        traceId,
        {
          agentType: 'DoubleQLearning',
          agentId: 'agent-0',
          reward: 1.1,
          tdError: 0.4,
          qBefore: 0.2,
          qAfter: 0.6,
          terminal: false,
          durationMs: 1,
        },
        requiredAttrs
      );

      expect(otelEvent.name).toBe('rl.policy.update');
      expect(otelEvent.attributes['rl.update.reward']).toBe(1.1);
      expect(otelEvent.attributes['rl.update.td_error']).toBe(0.4);
      expect(otelEvent.attributes['rl.update.q_before']).toBe(0.2);
      expect(otelEvent.attributes['rl.update.q_after']).toBe(0.6);
      expect(otelEvent.attributes['rl.convergence.delta']).toBeCloseTo(0.4, 6);
      expect(otelEvent.attributes['rl.update.terminal']).toBe(false);
    });

    it('should mark terminal updates correctly', () => {
      const { otelEvent } = Instrumentation.createRlPolicyUpdateEvent(
        traceId,
        {
          agentType: 'SARSA',
          agentId: 'agent-0',
          reward: -2.0,
          tdError: -1.5,
          qBefore: 0.5,
          qAfter: -1.0,
          terminal: true,
        },
        requiredAttrs
      );
      expect(otelEvent.attributes['rl.update.terminal']).toBe(true);
    });
  });

  describe('RL agent switch events', () => {
    it('should record from/to agents and ucb score', () => {
      const { otelEvent } = Instrumentation.createRlAgentSwitchEvent(
        traceId,
        'QLearning',
        'ExpectedSARSA',
        requiredAttrs,
        { ucbScore: 1.42, cycleCount: 100 }
      );

      expect(otelEvent.name).toBe('rl.agent.switch');
      expect(otelEvent.attributes['rl.agent.from']).toBe('QLearning');
      expect(otelEvent.attributes['rl.agent.to']).toBe('ExpectedSARSA');
      expect(otelEvent.attributes['rl.linucb.score']).toBe(1.42);
      expect(otelEvent.attributes['rl.cycle.count']).toBe(100);
    });
  });

  describe('Prediction task events', () => {
    it('should create prediction.<task> span (normalizing dashes to underscores)', () => {
      const { event, otelEvent } = Instrumentation.createPredictionTaskStartedEvent(
        traceId,
        'next-activity',
        requiredAttrs,
        { inputTraceCount: 100, inputEventCount: 1234, topK: 3, ngramOrder: 2 }
      );

      expect(event.predictionTask).toBe('next_activity');
      expect(otelEvent.name).toBe('prediction.next_activity');
      expect(otelEvent.attributes['prediction.task']).toBe('next_activity');
      expect(otelEvent.attributes['prediction.input.trace_count']).toBe(100);
      expect(otelEvent.attributes['prediction.input.event_count']).toBe(1234);
      expect(otelEvent.attributes['prediction.top_k']).toBe(3);
      expect(otelEvent.attributes['prediction.ngram_order']).toBe(2);
    });

    it('should emit completed span with output count', () => {
      const start = Instrumentation.createPredictionTaskStartedEvent(
        traceId,
        'remaining-time',
        requiredAttrs
      );
      const complete = Instrumentation.createPredictionTaskCompletedEvent(
        traceId,
        start.event.spanId,
        'remaining-time',
        requiredAttrs,
        { outputPredictionCount: 50, durationMs: 12 }
      );
      expect(complete.name).toBe('prediction.remaining_time');
      expect(complete.attributes['prediction.output.count']).toBe(50);
      expect(complete.attributes['prediction.duration_ms']).toBe(12);
      expect(complete.status?.code).toBe('OK');
    });

    it('should set ERROR status when failure occurs', () => {
      const start = Instrumentation.createPredictionTaskStartedEvent(
        traceId,
        'outcome',
        requiredAttrs
      );
      const complete = Instrumentation.createPredictionTaskCompletedEvent(
        traceId,
        start.event.spanId,
        'outcome',
        requiredAttrs,
        { status: 'ERROR', errorCode: 'PRED_400', errorMessage: 'no labels' }
      );
      expect(complete.status?.code).toBe('ERROR');
      expect(complete.status?.message).toBe('no labels');
      expect(complete.attributes['error.code']).toBe('PRED_400');
    });
  });

  describe('Drift detection events', () => {
    it('should create drift.check span pair with score and detection flag', () => {
      const start = Instrumentation.createDriftCheckStartedEvent(traceId, 'ewma', requiredAttrs, {
        windowSize: 10,
        threshold: 0.05,
      });
      expect(start.otelEvent.name).toBe('drift.check');
      expect(start.otelEvent.attributes['drift.method']).toBe('ewma');
      expect(start.otelEvent.attributes['drift.window_size']).toBe(10);
      expect(start.otelEvent.attributes['drift.threshold']).toBe(0.05);

      const complete = Instrumentation.createDriftCheckCompletedEvent(
        traceId,
        start.event.spanId,
        'ewma',
        requiredAttrs,
        { driftScore: 0.12, driftDetected: true, durationMs: 3 }
      );
      expect(complete.attributes['drift.score']).toBe(0.12);
      expect(complete.attributes['drift.detected']).toBe(true);
    });
  });

  describe('Conformance check events', () => {
    it('should record fitness/precision/generalization/simplicity', () => {
      const start = Instrumentation.createConformanceCheckStartedEvent(
        traceId,
        'token_replay',
        requiredAttrs,
        { modelKind: 'petri_net', traceCount: 1000 }
      );
      expect(start.otelEvent.name).toBe('conformance.check');

      const complete = Instrumentation.createConformanceCheckCompletedEvent(
        traceId,
        start.event.spanId,
        'token_replay',
        requiredAttrs,
        {
          fitness: 0.92,
          precision: 0.87,
          generalization: 0.81,
          simplicity: 0.78,
          durationMs: 50,
        }
      );
      expect(complete.attributes['conformance.fitness']).toBe(0.92);
      expect(complete.attributes['conformance.precision']).toBe(0.87);
      expect(complete.attributes['conformance.generalization']).toBe(0.81);
      expect(complete.attributes['conformance.simplicity']).toBe(0.78);
      expect(complete.status?.code).toBe('OK');
    });
  });

  describe('ML execution wrapper (instrumentMlExecution)', () => {
    it('should emit start + completed spans on success', async () => {
      const captured: any[] = [];
      const result = await Instrumentation.instrumentMlExecution(
        traceId,
        'classify',
        'knn',
        requiredAttrs,
        async () => 42,
        (e) => captured.push(e),
        { inputAttributes: { inputTraceCount: 50, parameterK: 3 } }
      );
      expect(result).toBe(42);
      expect(captured).toHaveLength(2);
      expect(captured[0].name).toBe('ml.classify');
      expect(captured[0].attributes['ml.input.trace_count']).toBe(50);
      expect(captured[0].attributes['ml.parameter.k']).toBe(3);
      expect(captured[1].name).toBe('ml.classify');
      expect(captured[1].status.code).toBe('OK');
      expect(captured[1].attributes).toHaveProperty('ml.duration_ms');
    });

    it('should emit ERROR-status completion span and re-throw on failure', async () => {
      const captured: any[] = [];
      await expect(
        Instrumentation.instrumentMlExecution(
          traceId,
          'cluster',
          'kmeans',
          requiredAttrs,
          async () => {
            throw new Error('boom');
          },
          (e) => captured.push(e)
        )
      ).rejects.toThrow('boom');

      expect(captured).toHaveLength(2);
      expect(captured[1].status.code).toBe('ERROR');
      expect(captured[1].status.message).toBe('boom');
    });

    it('should never block on OTEL: emit failures are swallowed', async () => {
      const result = await Instrumentation.instrumentMlExecution(
        traceId,
        'forecast',
        'linear',
        requiredAttrs,
        async () => 'ok',
        () => {
          throw new Error('exporter dead');
        }
      );
      expect(result).toBe('ok');
    });
  });

  describe('Span name and attribute conventions', () => {
    it('all ML/RL/prediction/drift/conformance spans carry service.name=wasm4pm', () => {
      const events: any[] = [
        Instrumentation.createRlAgentDecisionEvent(
          traceId,
          {
            agentType: 'QLearning',
            agentId: 'a',
            actionSelected: 0,
            stateHealthLevel: 0,
            stateCircuitState: 'Closed',
          },
          requiredAttrs
        ).otelEvent,
        Instrumentation.createRlPolicyUpdateEvent(
          traceId,
          { agentType: 'QLearning', agentId: 'a', reward: 0, tdError: 0, qBefore: 0, qAfter: 0 },
          requiredAttrs
        ).otelEvent,
        Instrumentation.createPredictionTaskStartedEvent(traceId, 'drift', requiredAttrs).otelEvent,
        Instrumentation.createDriftCheckStartedEvent(traceId, 'ewma', requiredAttrs).otelEvent,
        Instrumentation.createConformanceCheckStartedEvent(traceId, 'alignments', requiredAttrs)
          .otelEvent,
      ];
      for (const e of events) {
        expect(e.attributes['service.name']).toBe('wasm4pm');
        // All required attrs present:
        expect(e.attributes['run.id']).toBe(requiredAttrs['run.id']);
        expect(e.attributes['config.hash']).toBe(requiredAttrs['config.hash']);
      }
    });
  });
});
