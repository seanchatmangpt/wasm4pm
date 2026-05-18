/**
 * error-span-capture.test.ts
 *
 * Unit tests for error capture and OTEL span emission utilities
 * Verifies: error extraction, span generation, sensitivity redaction, formatting
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractErrorContext,
  emitErrorSpan,
  withErrorSpanCapture,
  withErrorSpanCaptureAndThrow,
  isCriticalError,
  redactSensitiveData,
  formatErrorForCli,
  formatErrorForJson,
} from '../error-span-capture.js';

describe('extractErrorContext', () => {
  it('should extract context from Error instances', () => {
    const err = new Error('Test error message');
    const ctx = extractErrorContext(err);

    expect(ctx.message).toBe('Test error message');
    expect(ctx.type).toBe('Error');
    expect(ctx.stack).toBeDefined();
    expect(ctx.severity).toBe('error');
  });

  it('should extract context from Error subclasses', () => {
    const err = new TypeError('Type error message');
    const ctx = extractErrorContext(err);

    expect(ctx.message).toBe('Type error message');
    expect(ctx.type).toBe('TypeError');
  });

  it('should handle string errors', () => {
    const ctx = extractErrorContext('String error');

    expect(ctx.message).toBe('String error');
    expect(ctx.type).toBe('String');
  });

  it('should handle unknown objects', () => {
    const ctx = extractErrorContext({ code: 'ERR_CODE' });

    expect(ctx.message).toBe('[object Object]');
    expect(ctx.type).toBe('Object');
  });

  it('should extract error.cause chain', () => {
    const cause = new Error('Root cause');
    const err = new Error('Main error');
    (err as any).cause = cause;

    const ctx = extractErrorContext(err);

    expect(ctx.message).toBe('Main error');
    expect(ctx.cause?.message).toBe('Root cause');
    expect(ctx.cause?.type).toBe('Error');
  });

  it('should extract system error codes (Node.js)', () => {
    const err = new Error('File not found') as any;
    err.code = 'ENOENT';

    const ctx = extractErrorContext(err);

    expect(ctx.code).toBe('ENOENT');
  });

  it('should accept custom severity levels', () => {
    const err = new Error('Critical error');

    const warningCtx = extractErrorContext(err, 'warning');
    expect(warningCtx.severity).toBe('warning');

    const fatalCtx = extractErrorContext(err, 'fatal');
    expect(fatalCtx.severity).toBe('fatal');
  });
});

describe('emitErrorSpan', () => {
  it('should emit span with error details', () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);
    const err = new Error('Test error');

    emitErrorSpan(sink, 'test.operation', err);

    expect(spans.length).toBe(1);
    const span = spans[0];
    expect(span.name).toBe('test.operation');
    expect(span.status.code).toBe('ERROR');
    expect(span.status.message).toBe('Test error');
    expect(span.attributes['error.type']).toBe('Error');
    expect(span.attributes['error.message']).toBe('Test error');
  });

  it('should include stack trace in span attributes', () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);
    const err = new Error('Stack trace error');

    emitErrorSpan(sink, 'test.stack', err);

    const span = spans[0];
    expect(span.attributes['error.stack_trace']).toBeDefined();
    expect(typeof span.attributes['error.stack_trace']).toBe('string');
  });

  it('should merge custom attributes with error attributes', () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);
    const err = new Error('Contextualized error');

    emitErrorSpan(sink, 'test.custom', err, {
      'operation.name': 'discover_dfg',
      'input.log_handle': 'handle-123',
    });

    const span = spans[0];
    expect(span.attributes['operation.name']).toBe('discover_dfg');
    expect(span.attributes['input.log_handle']).toBe('handle-123');
    expect(span.attributes['error.message']).toBe('Contextualized error');
  });

  it('should track error causes in span', () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);
    const cause = new Error('Root cause');
    const err = new Error('Wrapper error');
    (err as any).cause = cause;

    emitErrorSpan(sink, 'test.cause', err);

    const span = spans[0];
    expect(span.attributes['error.has_cause']).toBe(true);
    expect(span.attributes['error.cause_type']).toBe('Error');
    expect(span.attributes['error.cause_message']).toBe('Root cause');
  });

  it('should never throw on span emission failure', () => {
    const badSink = (span: any) => {
      throw new Error('Sink error');
    };
    const err = new Error('Test error');

    // Should not throw
    expect(() => {
      emitErrorSpan(badSink, 'test.safe', err);
    }).not.toThrow();
  });
});

describe('withErrorSpanCapture', () => {
  it('should capture and return undefined on error', async () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);

    const result = await withErrorSpanCapture(
      sink,
      'failing_op',
      async () => {
        throw new Error('Operation failed');
      }
    );

    expect(result).toBeUndefined();
    expect(spans.length).toBe(1);
    expect(spans[0].attributes['error.recovered']).toBe(true);
  });

  it('should return success value on success', async () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);

    const result = await withErrorSpanCapture(
      sink,
      'success_op',
      async () => 'success'
    );

    expect(result).toBe('success');
    expect(spans.length).toBe(0); // No error span on success
  });
});

describe('withErrorSpanCaptureAndThrow', () => {
  it('should emit span and re-throw on error', async () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);

    await expect(async () => {
      await withErrorSpanCaptureAndThrow(
        sink,
        'critical_op',
        async () => {
          throw new Error('Critical operation failed');
        }
      );
    }).rejects.toThrow('Critical operation failed');

    expect(spans.length).toBe(1);
    expect(spans[0].attributes['error.fatal']).toBe(true);
  });

  it('should return value on success', async () => {
    const spans: any[] = [];
    const sink = (span: any) => spans.push(span);

    const result = await withErrorSpanCaptureAndThrow(sink, 'success_op', async () => 42);

    expect(result).toBe(42);
    expect(spans.length).toBe(0);
  });
});

describe('isCriticalError', () => {
  it('should identify EvalError as critical', () => {
    const err = new EvalError('Eval error');
    expect(isCriticalError(err)).toBe(true);
  });

  it('should identify TypeError as critical (built-in)', () => {
    const err = new TypeError('Type error');
    expect(isCriticalError(err)).toBe(true);
  });

  it('should identify RangeError as critical', () => {
    const err = new RangeError('Range error');
    expect(isCriticalError(err)).toBe(true);
  });

  it('should identify FATAL-prefixed messages as critical', () => {
    const err = new Error('FATAL: System failure');
    expect(isCriticalError(err)).toBe(true);
  });

  it('should identify PANIC-prefixed messages as critical', () => {
    const err = new Error('PANIC: Unrecoverable state');
    expect(isCriticalError(err)).toBe(true);
  });

  it('should identify fatal severity as critical', () => {
    const err = new Error('Critical error');
    expect(isCriticalError(err)).toBe(false); // Default severity is 'error', not 'fatal'
  });

  it('should not identify normal errors as critical', () => {
    const err = new Error('Normal error');
    expect(isCriticalError(err)).toBe(false);
  });
});

describe('redactSensitiveData', () => {
  it('should redact password fields', () => {
    const msg = 'Failed with password=secret123 in config';
    const redacted = redactSensitiveData(msg);
    expect(redacted).toContain('***REDACTED***');
    expect(redacted).not.toContain('secret123');
  });

  it('should redact token fields', () => {
    const msg = 'Invalid token=eyJhbGc...abc123';
    const redacted = redactSensitiveData(msg);
    expect(redacted).toContain('***REDACTED***');
    expect(redacted).not.toContain('eyJhbGc');
  });

  it('should redact api_key fields', () => {
    const msg = 'API key is api_key=sk-12345abcde';
    const redacted = redactSensitiveData(msg);
    expect(redacted).toContain('***REDACTED***');
    expect(redacted).not.toContain('sk-12345');
  });

  it('should redact authorization headers', () => {
    const msg = 'Authorization: Bearer xyz123abc';
    const redacted = redactSensitiveData(msg);
    expect(redacted).toContain('***REDACTED***');
    expect(redacted).not.toContain('Bearer xyz123abc');
  });

  it('should be case-insensitive', () => {
    const msg = 'PASSWORD=mypass123 Password=another Token=tok123';
    const redacted = redactSensitiveData(msg);
    expect(redacted).toContain('***REDACTED***');
  });
});

describe('formatErrorForCli', () => {
  it('should format simple errors', () => {
    const err = new Error('Test error');
    const formatted = formatErrorForCli(err);
    expect(formatted).toContain('Error');
    expect(formatted).toContain('Test error');
  });

  it('should include error code if present', () => {
    const err = new Error('File not found') as any;
    err.code = 'ENOENT';
    const formatted = formatErrorForCli(err);
    expect(formatted).toContain('ENOENT');
  });

  it('should include cause chain', () => {
    const cause = new Error('Root cause');
    const err = new Error('Main error');
    (err as any).cause = cause;
    const formatted = formatErrorForCli(err);
    expect(formatted).toContain('Main error');
    expect(formatted).toContain('Root cause');
    expect(formatted).toContain('Caused by');
  });
});

describe('formatErrorForJson', () => {
  it('should format error as JSON structure', () => {
    const err = new Error('Test error');
    const json = formatErrorForJson(err);

    expect(json.error).toBeDefined();
    expect(json.error.type).toBe('Error');
    expect(json.error.message).toBe('Test error');
    expect(json.error.timestamp).toBeDefined();
  });

  it('should include stack trace lines', () => {
    const err = new Error('Stack error');
    const json = formatErrorForJson(err);

    expect(json.error.stack).toBeDefined();
    expect(Array.isArray(json.error.stack)).toBe(true);
  });

  it('should include cause in JSON', () => {
    const cause = new Error('Cause');
    const err = new Error('Main');
    (err as any).cause = cause;
    const json = formatErrorForJson(err);

    expect(json.error.cause).toBeDefined();
    expect(json.error.cause?.type).toBe('Error');
    expect(json.error.cause?.message).toBe('Cause');
  });
});
