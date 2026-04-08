/**
 * Unit tests for the ML step dispatcher bridge.
 *
 * Tests buildKernelStepHandlers() without requiring real WASM.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildKernelStepHandlers,
  type EngineStepResult,
} from '../src/step-dispatcher.js';

describe('Step Dispatcher', () => {
  describe('buildKernelStepHandlers', () => {
    const mockWasmModule = {} as any;
    const mockHandle = 'test-handle';

    it('returns a Map with all 6 ML algorithm keys', () => {
      const handlers = buildKernelStepHandlers(mockWasmModule, mockHandle);
      expect(handlers).toBeInstanceOf(Map);
      expect(handlers.size).toBe(6);
      expect(handlers.has('ml_classify')).toBe(true);
      expect(handlers.has('ml_cluster')).toBe(true);
      expect(handlers.has('ml_forecast')).toBe(true);
      expect(handlers.has('ml_anomaly')).toBe(true);
      expect(handlers.has('ml_regress')).toBe(true);
      expect(handlers.has('ml_pca')).toBe(true);
    });

    it('does not include non-ML algorithm keys', () => {
      const handlers = buildKernelStepHandlers(mockWasmModule, mockHandle);
      expect(handlers.has('dfg')).toBe(false);
      expect(handlers.has('alpha_plus_plus')).toBe(false);
      expect(handlers.has('genetic_algorithm')).toBe(false);
    });

    it('each handler is an async function', () => {
      const handlers = buildKernelStepHandlers(mockWasmModule, mockHandle);
      for (const [key, handler] of handlers) {
        expect(typeof handler).toBe('function');
      }
    });

    it('handler returns stepId matching step id', async () => {
      const handlers = buildKernelStepHandlers(mockWasmModule, mockHandle);
      const handler = handlers.get('ml_classify')!;
      const result = await handler({ id: 'my-ml-step', name: 'ml_classify' }, {});
      expect(result.stepId).toBe('my-ml-step');
    });

    it('handler returns success:false when implementAlgorithmStep throws', async () => {
      const throwingModule = {
        implementAlgorithmStep: () => {
          throw new Error('WASM not loaded');
        },
      } as any;
      const handlers = buildKernelStepHandlers(throwingModule, mockHandle);
      const handler = handlers.get('ml_regress')!;
      const result = await handler({ id: 'fail-step', name: 'ml_regress' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('ML_STEP_FAILED');
      expect(result.error?.severity).toBe('error');
      expect(result.error?.recoverable).toBe(true);
      expect(result.error?.context?.algorithmId).toBe('ml_regress');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handler returns success:true with output when implementAlgorithmStep succeeds', async () => {
      const mockImpl = async () => ({
        algorithm: 'ml_classify',
        outputType: 'ml_result',
        modelHandle: null,
        executionTimeMs: 42,
        parameters: {},
        metadata: {},
      });
      const handlers = buildKernelStepHandlers(mockWasmModule, mockHandle, mockImpl as any);
      const handler = handlers.get('ml_classify')!;
      const result = await handler({ id: 'good-step', name: 'ml_classify' }, {});

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output?.algorithm).toBe('ml_classify');
      expect(result.output?.outputType).toBe('ml_result');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
