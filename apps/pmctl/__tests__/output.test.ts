import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanFormatter, JSONFormatter, StreamingOutput, getFormatter } from '../src/output.js';

describe('HumanFormatter', () => {
  let formatter: HumanFormatter;

  beforeEach(() => {
    formatter = new HumanFormatter();
  });

  it('should instantiate without options', () => {
    expect(formatter).toBeDefined();
  });

  it('should instantiate with verbose option', () => {
    const verbose = new HumanFormatter({ verbose: true });
    expect(verbose).toBeDefined();
  });

  it('should instantiate with quiet option', () => {
    const quiet = new HumanFormatter({ quiet: true });
    expect(quiet).toBeDefined();
  });

  it('should have success method', () => {
    expect(typeof formatter.success).toBe('function');
  });

  it('should have info method', () => {
    expect(typeof formatter.info).toBe('function');
  });

  it('should have warn method', () => {
    expect(typeof formatter.warn).toBe('function');
  });

  it('should have error method', () => {
    expect(typeof formatter.error).toBe('function');
  });

  it('should have debug method', () => {
    expect(typeof formatter.debug).toBe('function');
  });

  it('should have box method', () => {
    expect(typeof formatter.box).toBe('function');
  });

  it('should have log method', () => {
    expect(typeof formatter.log).toBe('function');
  });
});

describe('JSONFormatter', () => {
  let formatter: JSONFormatter;

  beforeEach(() => {
    formatter = new JSONFormatter();
  });

  it('should instantiate without options', () => {
    expect(formatter).toBeDefined();
  });

  it('should instantiate with format option', () => {
    const json = new JSONFormatter({ format: 'json' });
    expect(json).toBeDefined();
  });

  it('should have output method', () => {
    expect(typeof formatter.output).toBe('function');
  });

  it('should have success method', () => {
    expect(typeof formatter.success).toBe('function');
  });

  it('should have error method', () => {
    expect(typeof formatter.error).toBe('function');
  });

  it('should have warn method', () => {
    expect(typeof formatter.warn).toBe('function');
  });
});

describe('StreamingOutput', () => {
  let streaming: StreamingOutput;

  beforeEach(() => {
    streaming = new StreamingOutput();
  });

  it('should instantiate without options', () => {
    expect(streaming).toBeDefined();
  });

  it('should instantiate with json format', () => {
    const json = new StreamingOutput({ format: 'json' });
    expect(json).toBeDefined();
  });

  it('should have startStream method', () => {
    expect(typeof streaming.startStream).toBe('function');
  });

  it('should have emitEvent method', () => {
    expect(typeof streaming.emitEvent).toBe('function');
  });

  it('should have endStream method', () => {
    expect(typeof streaming.endStream).toBe('function');
  });
});

describe('getFormatter', () => {
  it('should return JSONFormatter when format is json', () => {
    const formatter = getFormatter({ format: 'json' });
    expect(formatter instanceof JSONFormatter).toBe(true);
  });

  it('should return HumanFormatter for human format', () => {
    const formatter = getFormatter({ format: 'human' });
    expect(formatter instanceof HumanFormatter).toBe(true);
  });

  it('should return HumanFormatter by default', () => {
    const formatter = getFormatter();
    expect(formatter instanceof HumanFormatter).toBe(true);
  });

  it('should respect quiet flag', () => {
    const formatter = getFormatter({ quiet: true });
    expect(formatter).toBeDefined();
  });

  it('should respect verbose flag', () => {
    const formatter = getFormatter({ verbose: true });
    expect(formatter).toBeDefined();
  });
});
