/**
 * Planner test fixtures — 12 sample configurations covering all execution profiles,
 * source kinds, algorithm types, and edge cases.
 */

export interface TestConfig {
  version: '1.0';
  source: { kind: string; path?: string; format?: string; content?: string };
  execution: {
    profile: string;
    timeout?: number;
    maxMemory?: number;
    mode?: string;
    maxEvents?: number;
    parameters?: Record<string, unknown>;
  };
  observability?: {
    otel?: { enabled: boolean; endpoint?: string };
    logLevel?: string;
    metricsEnabled?: boolean;
  };
  watch?: {
    enabled: boolean;
    interval: number;
    debounce?: number;
  };
  output?: {
    format: string;
    destination: string;
    pretty?: boolean;
    colorize?: boolean;
    generateReports?: boolean;
    includeMetrics?: boolean;
  };
  pipeline?: Array<{
    id: string;
    type: string;
    required?: boolean;
    parameters?: Record<string, unknown>;
    dependsOn?: string[];
    parallelizable?: boolean;
  }>;
  metadata?: { name?: string; description?: string; tags?: string[] };
}

/** Minimal valid config — fast DFG discovery */
export const MINIMAL_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/events.xes', format: 'xes' },
  execution: { profile: 'fast' },
};

/** Balanced profile with Alpha++ */
export const BALANCED_ALPHA_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/events.xes', format: 'xes' },
  execution: { profile: 'balanced', timeout: 30000, maxMemory: 512 },
  output: { format: 'json', destination: './output', pretty: true, colorize: false },
  metadata: { name: 'alpha-test', tags: ['alpha', 'balanced'] },
};

/** Quality profile with genetic algorithm */
export const QUALITY_GENETIC_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/complex-log.xes', format: 'xes' },
  execution: {
    profile: 'quality',
    timeout: 120000,
    maxMemory: 2048,
    parameters: { generations: 100, populationSize: 50 },
  },
  output: {
    format: 'json',
    destination: './output',
    generateReports: true,
    includeMetrics: true,
  },
  metadata: { name: 'genetic-quality', description: 'Quality run with genetic algorithm' },
};

/** Streaming profile with watch mode */
export const STREAM_WATCH_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'stream', path: 'tcp://localhost:9090' },
  execution: { profile: 'stream', timeout: 0, mode: 'watch' },
  watch: { enabled: true, interval: 5000, debounce: 1000 },
  output: { format: 'json', destination: 'stdout' },
};

/** HTTP source with OTEL enabled */
export const HTTP_OTEL_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'http', path: 'https://api.example.com/events' },
  execution: { profile: 'balanced', timeout: 60000 },
  observability: {
    otel: { enabled: true, endpoint: 'http://localhost:4318' },
    logLevel: 'debug',
    metricsEnabled: true,
  },
};

/** Pipeline config with multi-step DAG */
export const PIPELINE_DAG_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/events.json', format: 'json' },
  execution: { profile: 'balanced', timeout: 60000 },
  pipeline: [
    { id: 'load', type: 'load_source', required: true },
    { id: 'validate', type: 'validate_source', required: true, dependsOn: ['load'] },
    { id: 'dfg', type: 'discover_dfg', required: true, dependsOn: ['validate'], parallelizable: true },
    { id: 'heuristic', type: 'discover_heuristic', required: false, dependsOn: ['validate'], parallelizable: true },
    { id: 'report', type: 'generate_reports', required: true, dependsOn: ['dfg', 'heuristic'] },
    { id: 'sink', type: 'write_sink', required: true, dependsOn: ['report'] },
  ],
};

/** ILP optimization config */
export const ILP_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/events.xes' },
  execution: {
    profile: 'quality',
    timeout: 300000,
    maxMemory: 4096,
    parameters: { solver: 'simplex', epsilon: 0.001 },
  },
};

/** OCEL (object-centric) config */
export const OCEL_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/ocel.json', format: 'ocel' },
  execution: { profile: 'balanced', maxEvents: 50000 },
  metadata: { name: 'ocel-discovery', tags: ['ocel', 'object-centric'] },
};

/** Config with inline XES content */
export const INLINE_CONTENT_CONFIG: TestConfig = {
  version: '1.0',
  source: {
    kind: 'inline',
    format: 'xes',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace><string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
  </trace>
</log>`,
  },
  execution: { profile: 'fast' },
};

/** Edge case: all optional fields omitted */
export const BARE_MINIMUM_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file' },
  execution: { profile: 'fast' },
};

/** Edge case: maxed-out timeouts and memory */
export const MAX_RESOURCES_CONFIG: TestConfig = {
  version: '1.0',
  source: { kind: 'file', path: '/data/huge.xes' },
  execution: {
    profile: 'quality',
    timeout: 600000,
    maxMemory: 8192,
    maxEvents: 1000000,
    enableProfiling: true,
  } as any,
  observability: {
    otel: { enabled: true, endpoint: 'http://otel:4318' },
    logLevel: 'debug',
    metricsEnabled: true,
  },
  output: {
    format: 'json',
    destination: './large-output',
    generateReports: true,
    includeMetrics: true,
    pretty: false,
  },
};

/** Invalid configs for negative testing */
export const INVALID_CONFIGS = {
  missingVersion: { source: { kind: 'file' }, execution: { profile: 'fast' } },
  missingSource: { version: '1.0', execution: { profile: 'fast' } },
  missingExecution: { version: '1.0', source: { kind: 'file' } },
  invalidProfile: { version: '1.0', source: { kind: 'file' }, execution: { profile: 'invalid' } },
  negativeTimeout: { version: '1.0', source: { kind: 'file' }, execution: { profile: 'fast', timeout: -1 } },
  zeroTimeout: { version: '1.0', source: { kind: 'file' }, execution: { profile: 'fast', timeout: 0 } },
  nullSource: { version: '1.0', source: null, execution: { profile: 'fast' } },
  emptyPipeline: { version: '1.0', source: { kind: 'file' }, execution: { profile: 'balanced' }, pipeline: [] },
  cyclicPipeline: {
    version: '1.0',
    source: { kind: 'file' },
    execution: { profile: 'balanced' },
    pipeline: [
      { id: 'a', type: 'discover_dfg', dependsOn: ['b'] },
      { id: 'b', type: 'discover_heuristic', dependsOn: ['a'] },
    ],
  },
} as Record<string, unknown>;

/** All valid configs as an array for iteration */
export const ALL_VALID_CONFIGS: TestConfig[] = [
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
];
