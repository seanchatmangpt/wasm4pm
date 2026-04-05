import { describe, it, expect } from 'vitest';
import {
  MINIMAL_CONFIG,
  BALANCED_ALPHA_CONFIG,
  QUALITY_GENETIC_CONFIG,
  STREAM_WATCH_CONFIG,
  HTTP_OTEL_CONFIG,
  PIPELINE_DAG_CONFIG,
  ILP_CONFIG,
  OCEL_CONFIG,
  INLINE_CONTENT_CONFIG,
  BARE_MINIMUM_CONFIG,
  MAX_RESOURCES_CONFIG,
  INVALID_CONFIGS,
  ALL_VALID_CONFIGS,
} from '../../src/fixtures/configs.js';
import {
  SIMPLE_SEQUENTIAL,
  PARALLEL_SPLIT,
  EXCLUSIVE_CHOICE,
  LOOP_PROCESS,
  EMPTY_LOG,
  SINGLE_EVENT,
  generateSyntheticLog,
  SAMPLE_XES,
} from '../../src/fixtures/events.js';
import {
  SUCCESS_RECEIPT,
  PARTIAL_RECEIPT,
  FAILED_RECEIPT,
  validateReceiptShape,
  validateExplainOutput,
} from '../../src/fixtures/expected-outputs.js';

describe('Config Fixtures', () => {
  it('should have 11 valid configs', () => {
    expect(ALL_VALID_CONFIGS).toHaveLength(11);
  });

  it('all valid configs have required fields', () => {
    for (const config of ALL_VALID_CONFIGS) {
      expect(config.version).toBe('1.0');
      expect(config.source).toBeDefined();
      expect(config.source.kind).toBeDefined();
      expect(config.execution).toBeDefined();
      expect(config.execution.profile).toBeDefined();
    }
  });

  it('minimal config has only required fields', () => {
    expect(MINIMAL_CONFIG.version).toBe('1.0');
    expect(MINIMAL_CONFIG.source.kind).toBe('file');
    expect(MINIMAL_CONFIG.execution.profile).toBe('fast');
    expect(MINIMAL_CONFIG.observability).toBeUndefined();
    expect(MINIMAL_CONFIG.watch).toBeUndefined();
  });

  it('balanced config has output settings', () => {
    expect(BALANCED_ALPHA_CONFIG.output).toBeDefined();
    expect(BALANCED_ALPHA_CONFIG.output!.format).toBe('json');
    expect(BALANCED_ALPHA_CONFIG.metadata).toBeDefined();
  });

  it('quality genetic config has algorithm parameters', () => {
    expect(QUALITY_GENETIC_CONFIG.execution.parameters).toBeDefined();
    expect(QUALITY_GENETIC_CONFIG.execution.parameters!.generations).toBe(100);
    expect(QUALITY_GENETIC_CONFIG.execution.parameters!.populationSize).toBe(50);
  });

  it('stream watch config enables watch mode', () => {
    expect(STREAM_WATCH_CONFIG.watch).toBeDefined();
    expect(STREAM_WATCH_CONFIG.watch!.enabled).toBe(true);
    expect(STREAM_WATCH_CONFIG.watch!.interval).toBe(5000);
  });

  it('HTTP OTEL config enables observability', () => {
    expect(HTTP_OTEL_CONFIG.observability).toBeDefined();
    expect(HTTP_OTEL_CONFIG.observability!.otel).toBeDefined();
    expect(HTTP_OTEL_CONFIG.observability!.otel!.enabled).toBe(true);
  });

  it('pipeline DAG config has pipeline steps with dependencies', () => {
    expect(PIPELINE_DAG_CONFIG.pipeline).toBeDefined();
    expect(PIPELINE_DAG_CONFIG.pipeline!.length).toBeGreaterThanOrEqual(4);
    const hasDeps = PIPELINE_DAG_CONFIG.pipeline!.some(s => s.dependsOn && s.dependsOn.length > 0);
    expect(hasDeps).toBe(true);
  });

  it('inline content config has embedded XES', () => {
    expect(INLINE_CONTENT_CONFIG.source.content).toBeDefined();
    expect(INLINE_CONTENT_CONFIG.source.content).toContain('<log');
  });

  it('bare minimum config has minimal source', () => {
    expect(BARE_MINIMUM_CONFIG.source.path).toBeUndefined();
  });

  it('max resources config has high limits', () => {
    expect(MAX_RESOURCES_CONFIG.execution.timeout).toBe(600000);
    expect(MAX_RESOURCES_CONFIG.execution.maxMemory).toBe(8192);
  });

  describe('Invalid Configs', () => {
    it('should have 9 invalid config variations', () => {
      expect(Object.keys(INVALID_CONFIGS)).toHaveLength(9);
    });

    it('missingVersion has no version field', () => {
      expect(INVALID_CONFIGS.missingVersion).not.toHaveProperty('version');
    });

    it('missingSource has no source field', () => {
      expect(INVALID_CONFIGS.missingSource).not.toHaveProperty('source');
    });

    it('missingExecution has no execution field', () => {
      expect(INVALID_CONFIGS.missingExecution).not.toHaveProperty('execution');
    });

    it('invalidProfile has bad profile value', () => {
      expect((INVALID_CONFIGS.invalidProfile as any).execution.profile).toBe('invalid');
    });

    it('negativeTimeout has negative timeout', () => {
      expect((INVALID_CONFIGS.negativeTimeout as any).execution.timeout).toBeLessThan(0);
    });

    it('nullSource has null source', () => {
      expect((INVALID_CONFIGS.nullSource as any).source).toBeNull();
    });

    it('emptyPipeline has zero pipeline steps', () => {
      expect((INVALID_CONFIGS.emptyPipeline as any).pipeline).toHaveLength(0);
    });

    it('cyclicPipeline has circular dependencies', () => {
      const pipeline = (INVALID_CONFIGS.cyclicPipeline as any).pipeline;
      const aDepends = pipeline[0].dependsOn;
      const bDepends = pipeline[1].dependsOn;
      expect(aDepends).toContain('b');
      expect(bDepends).toContain('a');
    });
  });
});

describe('Event Fixtures', () => {
  it('simple sequential has 2 traces with 3 events each', () => {
    expect(SIMPLE_SEQUENTIAL.traces).toHaveLength(2);
    expect(SIMPLE_SEQUENTIAL.traces[0].events).toHaveLength(3);
    expect(SIMPLE_SEQUENTIAL.traces[1].events).toHaveLength(3);
  });

  it('parallel split has concurrent events', () => {
    const case1 = PARALLEL_SPLIT.traces[0].events;
    expect(case1[1]['time:timestamp']).toBe(case1[2]['time:timestamp']);
  });

  it('exclusive choice has different paths', () => {
    const case1Activities = EXCLUSIVE_CHOICE.traces[0].events.map(e => e['concept:name']);
    const case2Activities = EXCLUSIVE_CHOICE.traces[1].events.map(e => e['concept:name']);
    expect(case1Activities).toContain('B');
    expect(case1Activities).not.toContain('C');
    expect(case2Activities).toContain('C');
    expect(case2Activities).not.toContain('B');
  });

  it('loop process has repeated activities', () => {
    const case3 = LOOP_PROCESS.traces[2].events.map(e => e['concept:name']);
    const bCount = case3.filter(a => a === 'B').length;
    expect(bCount).toBeGreaterThan(1);
  });

  it('empty log has no traces', () => {
    expect(EMPTY_LOG.traces).toHaveLength(0);
  });

  it('single event has exactly one event', () => {
    expect(SINGLE_EVENT.traces).toHaveLength(1);
    expect(SINGLE_EVENT.traces[0].events).toHaveLength(1);
  });

  it('generateSyntheticLog creates correct size', () => {
    const log = generateSyntheticLog(10, 5);
    expect(log.traces).toHaveLength(10);
    for (const trace of log.traces) {
      expect(trace.events).toHaveLength(5);
    }
  });

  it('generateSyntheticLog uses provided activities', () => {
    const log = generateSyntheticLog(3, 2, ['X', 'Y']);
    for (const trace of log.traces) {
      for (const event of trace.events) {
        expect(['X', 'Y']).toContain(event['concept:name']);
      }
    }
  });

  it('generateSyntheticLog assigns timestamps', () => {
    const log = generateSyntheticLog(2, 3);
    for (const trace of log.traces) {
      for (const event of trace.events) {
        expect(event['time:timestamp']).toBeDefined();
        expect(new Date(event['time:timestamp']!).getTime()).not.toBeNaN();
      }
    }
  });

  it('SAMPLE_XES is valid XML', () => {
    expect(SAMPLE_XES).toContain('<?xml');
    expect(SAMPLE_XES).toContain('<log');
    expect(SAMPLE_XES).toContain('</log>');
    expect(SAMPLE_XES).toContain('<trace>');
    expect(SAMPLE_XES).toContain('<event>');
  });
});

describe('Expected Outputs', () => {
  it('SUCCESS_RECEIPT has correct shape', () => {
    expect(SUCCESS_RECEIPT.status).toBe('success');
    expect(SUCCESS_RECEIPT.hasRunId).toBe(true);
    expect(SUCCESS_RECEIPT.hasConfigHash).toBe(true);
  });

  it('PARTIAL_RECEIPT has partial status', () => {
    expect(PARTIAL_RECEIPT.status).toBe('partial');
  });

  it('FAILED_RECEIPT has failed status', () => {
    expect(FAILED_RECEIPT.status).toBe('failed');
  });

  describe('validateReceiptShape', () => {
    it('passes for valid receipt', () => {
      const receipt = {
        status: 'success',
        run_id: 'run-1',
        config_hash: 'hash1',
        input_hash: 'hash2',
        plan_hash: 'hash3',
        duration_ms: 100,
      };
      const errors = validateReceiptShape(receipt, SUCCESS_RECEIPT);
      expect(errors).toHaveLength(0);
    });

    it('fails for missing run_id', () => {
      const receipt = {
        status: 'success',
        config_hash: 'hash1',
        input_hash: 'hash2',
        plan_hash: 'hash3',
        duration_ms: 100,
      };
      const errors = validateReceiptShape(receipt, SUCCESS_RECEIPT);
      expect(errors).toContain('missing run_id');
    });

    it('fails for wrong status', () => {
      const receipt = {
        status: 'failed',
        run_id: 'run-1',
        config_hash: 'hash1',
        input_hash: 'hash2',
        plan_hash: 'hash3',
        duration_ms: 100,
      };
      const errors = validateReceiptShape(receipt, SUCCESS_RECEIPT);
      expect(errors.some(e => e.includes('status'))).toBe(true);
    });

    it('fails for missing duration', () => {
      const receipt = {
        status: 'success',
        run_id: 'run-1',
        config_hash: 'hash1',
        input_hash: 'hash2',
        plan_hash: 'hash3',
      };
      const errors = validateReceiptShape(receipt, SUCCESS_RECEIPT);
      expect(errors).toContain('missing duration_ms');
    });

    it('accepts camelCase field names', () => {
      const receipt = {
        status: 'success',
        runId: 'run-1',
        configHash: 'hash1',
        inputHash: 'hash2',
        planHash: 'hash3',
        durationMs: 100,
      };
      const errors = validateReceiptShape(receipt, SUCCESS_RECEIPT);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateExplainOutput', () => {
    it('passes for output mentioning steps and algorithm', () => {
      const output = 'Step 1: Load source file\nStep 2: Discover DFG with fast profile\nStep 3: Write output';
      const errors = validateExplainOutput(output, {
        containsSteps: true,
        containsAlgorithm: true,
        containsProfile: true,
        containsSource: true,
        stepCount: 3,
      });
      expect(errors).toHaveLength(0);
    });

    it('fails if steps not mentioned', () => {
      const output = 'Running DFG discovery';
      const errors = validateExplainOutput(output, {
        containsSteps: true,
        containsAlgorithm: true,
        containsProfile: false,
        containsSource: false,
        stepCount: 0,
      });
      expect(errors.some(e => e.includes('steps'))).toBe(true);
    });
  });
});
