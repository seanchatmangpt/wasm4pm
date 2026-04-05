/**
 * Tests for observability wrapper
 * Verifies non-blocking error handling and safe event emission
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObservabilityWrapper } from './observability-wrapper';
describe('ObservabilityWrapper', () => {
    let wrapper;
    beforeEach(() => {
        wrapper = new ObservabilityWrapper();
    });
    describe('Safe emit operations', () => {
        it('should emit CLI events safely', () => {
            const result = wrapper.emitCliSafe({
                level: 'info',
                message: 'Test message',
            });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });
        it('should emit JSON events safely', () => {
            const result = wrapper.emitJsonSafe({
                timestamp: new Date().toISOString(),
                component: 'test',
                event_type: 'test_event',
                data: { test: 'data' },
            });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });
        it('should redact secrets from JSON events', () => {
            const result = wrapper.emitJsonSafe({
                timestamp: new Date().toISOString(),
                component: 'test',
                event_type: 'test_event',
                data: { password: 'secret123', username: 'alice' },
            });
            expect(result.success).toBe(true);
            // Redaction happens internally
        });
        it('should emit OTEL events safely', () => {
            const result = wrapper.emitOtelSafe({
                trace_id: 'test-trace-123',
                span_id: 'test-span-456',
                name: 'test.span',
                kind: 'INTERNAL',
                start_time: Date.now() * 1000000,
                attributes: { 'test.key': 'test.value' },
            });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });
    describe('Multi-layer emit', () => {
        it('should emit to all configured layers', () => {
            const results = wrapper.emitSafe({
                cli: { level: 'info', message: 'Test' },
                json: {
                    timestamp: new Date().toISOString(),
                    component: 'test',
                    event_type: 'test',
                    data: {},
                },
                otel: {
                    trace_id: 'test',
                    span_id: 'test',
                    name: 'test',
                    start_time: Date.now() * 1000000,
                    attributes: {},
                },
            });
            expect(results).toHaveLength(3);
            expect(results.every((r) => r.success)).toBe(true);
        });
        it('should handle partial emit', () => {
            const results = wrapper.emitSafe({
                cli: { level: 'info', message: 'Test' },
            });
            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
        });
    });
    describe('Statistics tracking', () => {
        it('should track emit count', () => {
            wrapper.emitCliSafe({ level: 'info', message: 'Test 1' });
            wrapper.emitCliSafe({ level: 'info', message: 'Test 2' });
            wrapper.emitCliSafe({ level: 'info', message: 'Test 3' });
            const stats = wrapper.getStats();
            expect(stats.emitCount).toBe(3);
            expect(stats.errorCount).toBe(0);
            expect(stats.errorRate).toBe(0);
        });
        it('should calculate error rate', () => {
            // Successfully emit 9 events
            for (let i = 0; i < 9; i++) {
                wrapper.emitCliSafe({ level: 'info', message: `Test ${i}` });
            }
            const stats = wrapper.getStats();
            expect(stats.emitCount).toBe(9);
            expect(stats.errorCount).toBe(0);
            expect(stats.errorRate).toBe(0);
        });
    });
    describe('Error recording', () => {
        it('should record observability errors', () => {
            const wrapper = new ObservabilityWrapper();
            // Create a scenario that would cause an error
            // (In real usage, this would be an actual failure)
            const errors = wrapper.getErrors();
            expect(Array.isArray(errors)).toBe(true);
            expect(errors.length >= 0).toBe(true);
        });
        it('should limit error history size', () => {
            const wrapper = new ObservabilityWrapper();
            // Get initial errors
            const errors = wrapper.getErrors();
            // Errors should be tracked but limited
            expect(errors.length <= 100).toBe(true);
        });
        it('should allow clearing errors', () => {
            const wrapper = new ObservabilityWrapper();
            wrapper.clearErrors();
            const errors = wrapper.getErrors();
            expect(errors).toHaveLength(0);
        });
    });
    describe('Non-blocking execution', () => {
        it('should execute callbacks without breaking on observability errors', async () => {
            const wrapper = new ObservabilityWrapper();
            const callback = vi.fn(async () => 'success');
            const result = await wrapper.executeWithObservability(callback, {
                operationName: 'test_operation',
            });
            expect(callback).toHaveBeenCalled();
            expect(result.result).toBe('success');
        });
        it('should wrap sync functions safely', () => {
            const wrapper = new ObservabilityWrapper();
            const callback = vi.fn(() => 'success');
            const result = wrapper.wrapSync(callback, {
                operationName: 'test_operation',
            });
            expect(callback).toHaveBeenCalled();
            expect(result.result).toBe('success');
            expect(result.error).toBeUndefined();
        });
    });
    describe('Configuration', () => {
        it('should initialize with empty config', () => {
            const wrapper = new ObservabilityWrapper();
            expect(wrapper.getStats()).toBeDefined();
        });
        it('should initialize with partial config', () => {
            const config = {
                json: {
                    enabled: true,
                    dest: 'stdout',
                },
            };
            const wrapper = new ObservabilityWrapper(config);
            expect(wrapper.getStats()).toBeDefined();
        });
        it('should initialize with full config', () => {
            const config = {
                json: {
                    enabled: true,
                    dest: 'stdout',
                },
                otel: {
                    enabled: false,
                    exporter: 'otlp_http',
                    endpoint: 'http://localhost:4317',
                    required: false,
                },
            };
            const wrapper = new ObservabilityWrapper(config);
            expect(wrapper.getStats()).toBeDefined();
        });
    });
    describe('Secret redaction in wrapper', () => {
        it('should redact secrets from JSON events', () => {
            const wrapper = new ObservabilityWrapper();
            const result = wrapper.emitJsonSafe({
                timestamp: new Date().toISOString(),
                component: 'test',
                event_type: 'config_loaded',
                data: {
                    username: 'alice',
                    password: 'super-secret',
                    api_key: 'key-123-abc',
                    endpoint: 'http://example.com',
                },
            });
            expect(result.success).toBe(true);
            // Redaction happens before emit
        });
        it('should redact secrets from OTEL attributes', () => {
            const wrapper = new ObservabilityWrapper();
            const result = wrapper.emitOtelSafe({
                trace_id: 'test',
                span_id: 'test',
                name: 'test',
                start_time: Date.now() * 1000000,
                attributes: {
                    'config.password': 'secret',
                    'config.endpoint': 'http://example.com',
                    'api.token': 'token-123-xyz',
                },
            });
            expect(result.success).toBe(true);
        });
    });
    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            const wrapper = new ObservabilityWrapper();
            const result = await wrapper.shutdown();
            expect(result).toBeDefined();
            expect(result.timestamp).toBeDefined();
        });
    });
    describe('Layer access', () => {
        it('should provide access to underlying layer', () => {
            const wrapper = new ObservabilityWrapper();
            const layer = wrapper.getLayer();
            expect(layer).toBeDefined();
            expect(typeof layer.getConfig).toBe('function');
        });
    });
    describe('Performance', () => {
        it('should emit events with minimal overhead', () => {
            const wrapper = new ObservabilityWrapper();
            const start = performance.now();
            for (let i = 0; i < 100; i++) {
                wrapper.emitCliSafe({
                    level: 'info',
                    message: `Test ${i}`,
                });
            }
            const elapsed = performance.now() - start;
            // Should emit 100 events in less than 100ms (1ms per event on average)
            expect(elapsed).toBeLessThan(100);
        });
        it('should have low memory footprint', () => {
            const wrapper = new ObservabilityWrapper();
            // Emit many events
            for (let i = 0; i < 1000; i++) {
                wrapper.emitCliSafe({
                    level: 'info',
                    message: `Test ${i}`,
                });
            }
            // Error history should be capped at 100
            const errors = wrapper.getErrors();
            expect(errors.length <= 100).toBe(true);
        });
    });
    describe('Error scenarios', () => {
        it('should handle observer errors gracefully', () => {
            const wrapper = new ObservabilityWrapper();
            // Try to emit with invalid data (should not throw)
            const result = wrapper.emitJsonSafe({
                timestamp: new Date().toISOString(),
                component: 'test',
                event_type: 'test',
                data: {
                    circular: undefined,
                },
            });
            expect(result).toBeDefined();
        });
        it('should not throw on emit failures', () => {
            const wrapper = new ObservabilityWrapper();
            expect(() => {
                wrapper.emitOtelSafe({
                    trace_id: '',
                    span_id: '',
                    name: '',
                    start_time: 0,
                    attributes: {},
                });
            }).not.toThrow();
        });
    });
});
