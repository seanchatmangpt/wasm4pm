import { describe, it, expect } from 'vitest';
import { parseWasmOutput, isKernelError, toTypedError } from '../api';
import { KernelError, TypedError } from '../types';

describe('Kernel Type Safety — loose type boundaries', () => {
  describe('parseWasmOutput — generic serialization', () => {
    it('should parse valid WASM output to typed result', () => {
      const wasmOutput: unknown = {
        algorithm: 'dfg',
        edges: [['A', 'B']],
        status: 'success',
      };

      const result = parseWasmOutput<{ algorithm: string; edges: string[][] }>(wasmOutput);
      
      expect(result).toHaveProperty('algorithm', 'dfg');
      expect(result).toHaveProperty('edges');
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it('should handle null/undefined input', () => {
      const result1 = parseWasmOutput<unknown>(null);
      const result2 = parseWasmOutput<unknown>(undefined);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should preserve type structure', () => {
      const input = {
        nodes: [{ id: '1', label: 'A' }],
        edges: [{ from: '1', to: '2' }],
      };

      const result = parseWasmOutput<typeof input>(input);
      
      expect(result.nodes[0]).toHaveProperty('id');
      expect(result.edges[0]).toHaveProperty('from');
    });

    it('should handle nested unknown types', () => {
      const nested: unknown = {
        level1: {
          level2: {
            level3: { value: 42 },
          },
        },
      };

      const result = parseWasmOutput<any>(nested);
      expect(result.level1.level2.level3.value).toBe(42);
    });
  });

  describe('isKernelError — error type guard', () => {
    it('should identify KernelError correctly', () => {
      const err = new KernelError('test', 'Test error');
      expect(isKernelError(err)).toBe(true);
    });

    it('should reject non-KernelError objects', () => {
      const genericError = new Error('Not a kernel error');
      expect(isKernelError(genericError)).toBe(false);
    });

    it('should handle unknown input safely', () => {
      expect(isKernelError(null)).toBe(false);
      expect(isKernelError(undefined)).toBe(false);
      expect(isKernelError('string')).toBe(false);
      expect(isKernelError(42)).toBe(false);
    });

    it('should distinguish KernelError from TypedError', () => {
      const kernelErr = new KernelError('k1', 'Kernel error');
      const typedErr = new TypedError('e1', 'algid', 'Typed error');
      
      expect(isKernelError(kernelErr)).toBe(true);
      expect(isKernelError(typedErr)).toBe(false);
    });
  });

  describe('toTypedError — error classification', () => {
    it('should classify unknown error to TypedError', () => {
      const rawError: unknown = new Error('Something failed');
      const typed = toTypedError(rawError, 'dfg');
      
      expect(typed).toBeInstanceOf(TypedError);
      expect(typed).toHaveProperty('algorithmId', 'dfg');
    });

    it('should preserve KernelError properties', () => {
      const kernelErr = new KernelError('k1', 'Kernel failure');
      const typed = toTypedError(kernelErr, 'heuristic');
      
      expect(typed).toBeInstanceOf(TypedError);
    });

    it('should handle object without error properties', () => {
      const obj: unknown = { code: 'ERROR', message: 'Failed' };
      const typed = toTypedError(obj, 'ilp');
      
      expect(typed).toBeInstanceOf(TypedError);
    });

    it('should assign algorithm ID consistently', () => {
      const err1 = toTypedError(new Error('fail1'), 'dfg');
      const err2 = toTypedError(new Error('fail2'), 'heuristic_miner');
      
      expect(err1.algorithmId).toBe('dfg');
      expect(err2.algorithmId).toBe('heuristic_miner');
    });
  });

  describe('WASM handler map operations — type safety', () => {
    it('should handle drift results with distance property', () => {
      const driftResult = {
        drifts: [
          { distance: 0.1, timestamp: '2026-05-17T00:00:00Z' },
          { distance: 0.2, timestamp: '2026-05-17T00:01:00Z' },
        ],
      };

      // This simulates the map operation from handlers.ts line 811
      const distances = (driftResult?.drifts ?? []).map((d) => d.distance ?? 0);
      
      expect(distances).toEqual([0.1, 0.2]);
      expect(distances.every((d) => typeof d === 'number')).toBe(true);
    });

    it('should handle missing drifts property', () => {
      const driftResult = { /* no drifts property */ };
      const distances = (driftResult?.drifts ?? []).map((d: any) => d.distance ?? 0);
      
      expect(distances).toEqual([]);
    });

    it('should handle null/undefined distances in drift items', () => {
      const driftResult = {
        drifts: [
          { distance: 0.5 },
          { distance: undefined },
          { /* no distance */ },
        ],
      };

      const distances = (driftResult.drifts).map((d: any) => d.distance ?? 0);
      
      expect(distances).toEqual([0.5, 0, 0]);
    });
  });
});
