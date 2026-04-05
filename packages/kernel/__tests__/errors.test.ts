import { describe, it, expect } from 'vitest';
import {
  KernelError,
  isKernelError,
  classifyRustError,
  toTypedError,
  wrapKernelCall,
} from '../src/errors';

describe('KernelError', () => {
  it('should create with code and message', () => {
    const err = new KernelError('something failed', 'ALGORITHM_FAILED');
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('ALGORITHM_FAILED');
    expect(err.name).toBe('KernelError');
    expect(err.recoverable).toBe(false);
    expect(err.timestamp).toBeInstanceOf(Date);
  });

  it('should support cause chaining', () => {
    const cause = new Error('root cause');
    const err = new KernelError('wrapper', 'WASM_INIT_FAILED', { cause });
    expect(err.cause).toBe(cause);
  });

  it('should support context', () => {
    const err = new KernelError('fail', 'ALGORITHM_FAILED', {
      context: { algorithm: 'dfg', handle: 'obj_1' },
    });
    expect(err.context.algorithm).toBe('dfg');
    expect(err.context.handle).toBe('obj_1');
  });

  it('should serialize to JSON', () => {
    const err = new KernelError('test', 'ALGORITHM_NOT_FOUND');
    const json = err.toJSON();
    expect(json.name).toBe('KernelError');
    expect(json.code).toBe('ALGORITHM_NOT_FOUND');
    expect(json.message).toBe('test');
    expect(json.timestamp).toBeDefined();
  });

  it('should be instanceof Error', () => {
    const err = new KernelError('test', 'ALGORITHM_FAILED');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KernelError);
  });
});

describe('isKernelError', () => {
  it('should detect KernelError', () => {
    const err = new KernelError('test', 'ALGORITHM_FAILED');
    expect(isKernelError(err)).toBe(true);
  });

  it('should reject plain Error', () => {
    expect(isKernelError(new Error('test'))).toBe(false);
  });

  it('should reject non-errors', () => {
    expect(isKernelError('string')).toBe(false);
    expect(isKernelError(null)).toBe(false);
    expect(isKernelError(undefined)).toBe(false);
  });
});

describe('classifyRustError', () => {
  it('should classify "not found" as ALGORITHM_FAILED', () => {
    expect(classifyRustError('Handle not found: obj_999')).toBe('ALGORITHM_FAILED');
  });

  it('should classify type mismatch', () => {
    expect(classifyRustError('Object is not an EventLog')).toBe('ALGORITHM_FAILED');
  });

  it('should classify memory errors', () => {
    expect(classifyRustError('memory access out of bounds')).toBe('WASM_MEMORY_EXCEEDED');
    expect(classifyRustError('alloc failed')).toBe('WASM_MEMORY_EXCEEDED');
  });

  it('should classify init failures', () => {
    expect(classifyRustError('WASM module not initialized')).toBe('WASM_INIT_FAILED');
    expect(classifyRustError('module not loaded')).toBe('WASM_INIT_FAILED');
  });

  it('should classify parse errors', () => {
    expect(classifyRustError('Invalid JSON input')).toBe('SOURCE_INVALID');
    expect(classifyRustError('Failed to parse XES')).toBe('SOURCE_INVALID');
  });

  it('should default to ALGORITHM_FAILED', () => {
    expect(classifyRustError('unknown weird error')).toBe('ALGORITHM_FAILED');
  });

  it('should handle empty/null input', () => {
    expect(classifyRustError('')).toBe('ALGORITHM_FAILED');
    expect(classifyRustError(null as any)).toBe('ALGORITHM_FAILED');
  });
});

describe('toTypedError', () => {
  it('should convert string error to TypedError', () => {
    const typed = toTypedError('Handle not found: obj_1', 'dfg');
    expect(typed.schema_version).toBe('1.0');
    expect(typed.code).toBe(30); // ALGORITHM_FAILED = 30
    expect(typed.message).toBe('Handle not found: obj_1');
    expect(typed.context).toHaveProperty('algorithm', 'dfg');
    expect(typed.context).toHaveProperty('source', 'wasm4pm-kernel');
  });

  it('should convert Error object to TypedError', () => {
    const typed = toTypedError(new Error('memory access out of bounds'));
    expect(typed.code).toBe(41); // WASM_MEMORY_EXCEEDED = 41
  });

  it('should work without algorithmId', () => {
    const typed = toTypedError('some error');
    expect(typed.context).not.toHaveProperty('algorithm');
    expect(typed.context).toHaveProperty('source', 'wasm4pm-kernel');
  });
});

describe('wrapKernelCall', () => {
  it('should pass through successful calls', async () => {
    const result = await wrapKernelCall(async () => 42);
    expect(result).toBe(42);
  });

  it('should convert errors to KernelError', async () => {
    await expect(
      wrapKernelCall(async () => {
        throw new Error('Handle not found: obj_1');
      }, { algorithm: 'dfg' })
    ).rejects.toThrow(KernelError);
  });

  it('should preserve algorithm context', async () => {
    try {
      await wrapKernelCall(async () => {
        throw new Error('test error');
      }, { algorithm: 'genetic_algorithm', step: 'discovery' });
    } catch (err) {
      expect(isKernelError(err)).toBe(true);
      if (isKernelError(err)) {
        expect(err.context.algorithm).toBe('genetic_algorithm');
        expect(err.context.step).toBe('discovery');
      }
    }
  });

  it('should classify WASM memory errors as recoverable', async () => {
    try {
      await wrapKernelCall(async () => {
        throw new Error('memory access out of bounds');
      });
    } catch (err) {
      if (isKernelError(err)) {
        expect(err.code).toBe('WASM_MEMORY_EXCEEDED');
        expect(err.recoverable).toBe(true);
      }
    }
  });
});
