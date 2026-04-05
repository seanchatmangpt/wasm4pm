/**
 * Tests for JSON writer
 * Verifies JSONL output, buffering, flushing, and secret redaction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { JsonWriter } from '../src/json-writer.js';
import { JsonEvent } from '../src/types.js';
import path from 'path';
import os from 'os';

describe('JsonWriter', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'observability-'));
    testFile = path.join(tmpDir, 'events.jsonl');
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write JSON events to file', async () => {
    const writer = new JsonWriter({
      enabled: true,
      dest: testFile,
    });

    const event: JsonEvent = {
      timestamp: '2026-04-04T12:00:00Z',
      component: 'test-component',
      event_type: 'test_event',
      data: { key: 'value' },
    };

    writer.emit(event);

    // Flush to ensure write
    await (writer as any).flush();
    await writer.shutdown();

    const content = await fs.readFile(testFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.component).toBe('test-component');
    expect(parsed.event_type).toBe('test_event');
  });

  it('should add timestamps if not provided', async () => {
    const writer = new JsonWriter({
      enabled: true,
      dest: testFile,
    });

    const event: JsonEvent = {
      component: 'test',
      event_type: 'test',
      data: {},
    };

    writer.emit(event);
    await (writer as any).flush();
    await writer.shutdown();

    const content = await fs.readFile(testFile, 'utf-8');
    const lines = content.trim().split('\n');
    const parsed = JSON.parse(lines[0]);

    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('should redact secrets from event data', () => {
    const data = {
      username: 'alice',
      password: 'secret123',
      api_key: 'key-12345',
      token: 'bearer-token',
      normal_field: 'public',
    };

    const redacted = JsonWriter.redactSecrets(data);

    expect(redacted.username).toBe('alice');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.api_key).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.normal_field).toBe('public');
  });

  it('should redact secrets recursively', () => {
    const data = {
      user: {
        name: 'alice',
        credentials: {
          password: 'secret123',
        },
      },
    };

    const redacted = JsonWriter.redactSecrets(data);

    expect(redacted.user.name).toBe('alice');
    expect(redacted.user.credentials.password).toBe('[REDACTED]');
  });

  it('should write to stdout when dest is stdout', async () => {
    const writer = new JsonWriter({
      enabled: true,
      dest: 'stdout',
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write');

    const event: JsonEvent = {
      timestamp: '2026-04-04T12:00:00Z',
      component: 'test',
      event_type: 'test',
      data: {},
    };

    writer.emit(event);
    await (writer as any).flush();
    await writer.shutdown();

    expect(stdoutSpy).toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('should buffer events and flush on interval', async () => {
    const writer = new JsonWriter({
      enabled: true,
      dest: testFile,
    });

    // Emit multiple events
    for (let i = 0; i < 5; i++) {
      writer.emit({
        timestamp: new Date().toISOString(),
        component: 'test',
        event_type: `event_${i}`,
        data: { index: i },
      });
    }

    // Wait for auto-flush
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await writer.shutdown();

    const content = await fs.readFile(testFile, 'utf-8');
    const lines = content.trim().split('\n').filter((l) => l.length > 0);

    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it('should not throw when disabled', async () => {
    const writer = new JsonWriter({
      enabled: false,
      dest: testFile,
    });

    expect(() => {
      writer.emit({
        timestamp: new Date().toISOString(),
        component: 'test',
        event_type: 'test',
        data: {},
      });
    }).not.toThrow();

    await writer.shutdown();
  });

  it('should gracefully handle file write errors', async () => {
    const writer = new JsonWriter({
      enabled: true,
      dest: '/invalid/path/that/does/not/exist/events.jsonl',
    });

    // Should not throw
    expect(() => {
      writer.emit({
        timestamp: new Date().toISOString(),
        component: 'test',
        event_type: 'test',
        data: {},
      });
    }).not.toThrow();

    const result = await writer.shutdown();
    // May or may not succeed depending on timing
    expect(result).toBeDefined();
  });
});
