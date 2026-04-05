/**
 * Test fixture configs for planner tests
 */
import type { Config } from '../../src/planner';

export const fastConfig: Config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'fast' },
};

export const balancedConfig: Config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'balanced' },
};

export const qualityConfig: Config = {
  version: '1.0',
  source: { format: 'csv' },
  execution: { profile: 'quality' },
};

export const researchConfig: Config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'research' },
};

export const streamConfig: Config = {
  version: '1.0',
  source: { format: 'json' },
  execution: { profile: 'stream' },
};

export const fullConfig: Config = {
  version: '1.0',
  source: { format: 'xes', content: '<xml>sample</xml>' },
  execution: {
    profile: 'balanced',
    mode: 'sync',
    maxEvents: 50000,
    maxMemoryMB: 512,
    timeoutMs: 30000,
    parameters: { threshold: 0.5, minSupport: 0.1 },
  },
  output: {
    generateReports: true,
    includeMetrics: true,
    format: 'json',
  },
  metadata: {
    name: 'Test Pipeline',
    description: 'Integration test configuration',
    tags: ['test', 'ci'],
  },
};

export const configWithSink: Config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'fast' },
  output: { format: 'parquet', generateReports: false },
};

export const invalidConfigs = {
  nullConfig: null as any,
  noVersion: { source: { format: 'xes' }, execution: { profile: 'fast' } } as any,
  badVersion: { version: '2.0', source: { format: 'xes' }, execution: { profile: 'fast' } } as any,
  noSource: { version: '1.0', execution: { profile: 'fast' } } as any,
  noProfile: { version: '1.0', source: { format: 'xes' } } as any,
};
