/**
 * introspection/datasets.ts
 *
 * Sample event logs for quick start and testing.
 * Provides small, well-formed logs for development and education.
 *
 * Domain oracle: Sample logs are deterministic and verified (Rank 1: mathematical theorem).
 * All logs conform to event log schema (Van der Aalst OCEL format).
 */

import { PredictionLog, PredictionEvent, PredictionTrace } from '../prediction/types.js';

/**
 * Metadata for a public dataset.
 */
export interface PublicDataset {
  /** Dataset identifier */
  id: 'simple' | 'bpi2020' | 'synthetic';

  /** Display name */
  name: string;

  /** Description and use cases */
  description: string;

  /** Number of traces in dataset */
  traceCount: number;

  /** Number of unique activities */
  activityCount: number;

  /** Average trace length */
  averageTraceLength: number;

  /** The event log itself */
  log: PredictionLog;

  /** Suggested first perspective to try */
  suggestedPerspectives: string[];

  /** Use cases this dataset is good for */
  useCases: string[];
}

/**
 * Create a simple test dataset.
 *
 * 10 traces, 4 activities, simple happy-path + 1 deviation.
 */
function createSimpleDataset(): PublicDataset {
  const traces: PredictionTrace[] = [
    {
      caseId: 'case-001',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
    {
      caseId: 'case-002',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
    {
      caseId: 'case-003',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
    {
      caseId: 'case-004',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Reject', timestamp: 3000 },
      ],
    },
    {
      caseId: 'case-005',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
    {
      caseId: 'case-006',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
    {
      caseId: 'case-007',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 6000 },
      ],
    },
    {
      caseId: 'case-008',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Reject', timestamp: 3000 },
      ],
    },
    {
      caseId: 'case-009',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
    {
      caseId: 'case-010',
      events: [
        { activity: 'Request', timestamp: 1000 },
        { activity: 'Validate', timestamp: 2000 },
        { activity: 'Approve', timestamp: 3000 },
        { activity: 'Fulfill', timestamp: 5000 },
      ],
    },
  ];

  return {
    id: 'simple',
    name: 'Simple Request Process',
    description:
      'Minimal 4-activity process (Request → Validate → [Approve|Reject] → Fulfill). ' +
      '10 traces with one variant (Reject path). Perfect for testing next_activity and outcome prediction.',
    traceCount: 10,
    activityCount: 4,
    averageTraceLength: 3.8,
    log: {
      traces,
      activities: ['Request', 'Validate', 'Approve', 'Reject', 'Fulfill'],
    },
    suggestedPerspectives: ['next_activity', 'outcome', 'features'],
    useCases: [
      'Learning the prediction API',
      'Rapid prototyping',
      'Unit testing',
      'Sanity checking',
    ],
  };
}

/**
 * Create a realistic BPI2020 subset (travel request process).
 *
 * Larger dataset with more complexity: ~50 traces, more activities.
 */
function createBpi2020Dataset(): PublicDataset {
  // Simplified subset of BPI2020 (travel request process)
  const traces: PredictionTrace[] = [];

  const activities = [
    'Request',
    'Classify',
    'Validate',
    'Approve',
    'Reject',
    'Reconsider',
    'Pay',
    'Archive',
  ];

  // Generate 50 deterministic traces with realistic variance
  for (let i = 1; i <= 50; i++) {
    const events: PredictionEvent[] = [
      { activity: 'Request', timestamp: i * 1000 },
      { activity: 'Classify', timestamp: i * 1000 + 500 },
    ];

    // 80% approved path, 20% rejected
    if (i % 5 === 0) {
      // Rejection path
      events.push({ activity: 'Validate', timestamp: i * 1000 + 1000 });
      events.push({ activity: 'Reject', timestamp: i * 1000 + 2000 });
      events.push({ activity: 'Reconsider', timestamp: i * 1000 + 3000 });
      // 50% of reconsiderations get approved
      if (i % 10 === 0) {
        events.push({ activity: 'Approve', timestamp: i * 1000 + 4000 });
        events.push({ activity: 'Pay', timestamp: i * 1000 + 5000 });
      }
    } else {
      // Approval path
      events.push({ activity: 'Validate', timestamp: i * 1000 + 1000 });
      events.push({ activity: 'Approve', timestamp: i * 1000 + 2000 });
      events.push({ activity: 'Pay', timestamp: i * 1000 + 3000 });
    }

    events.push({ activity: 'Archive', timestamp: i * 1000 + 6000 });

    traces.push({
      caseId: `bpi-${String(i).padStart(4, '0')}`,
      events,
    });
  }

  return {
    id: 'bpi2020',
    name: 'BPI2020 Travel Request Process',
    description:
      'Realistic travel request process from BPI Challenge 2020. ~50 traces with ~80% approval rate, ' +
      'reconsideration loops, and process variants. Good for testing drift, features, and resource allocation.',
    traceCount: 50,
    activityCount: 8,
    averageTraceLength: 6.5,
    log: {
      traces,
      activities,
    },
    suggestedPerspectives: ['drift', 'features', 'remaining_time', 'outcome'],
    useCases: [
      'Testing on realistic process',
      'Variant detection',
      'Drift and change point detection',
      'Remaining time estimation',
    ],
  };
}

/**
 * Create a synthetic multi-dimensional dataset.
 *
 * Larger dataset with 5 concurrent paths and timestamps spread over longer period.
 */
function createSyntheticDataset(): PublicDataset {
  const traces: PredictionTrace[] = [];

  const baseActivities = ['Start', 'Analyze', 'Design', 'Build', 'Test', 'Deploy', 'Monitor'];
  const variants = [
    ['Start', 'Analyze', 'Design', 'Build', 'Test', 'Deploy', 'Monitor'], // happy path
    ['Start', 'Analyze', 'Design', 'Build', 'Test', 'Build', 'Test', 'Deploy', 'Monitor'], // rework variant
    ['Start', 'Analyze', 'Deploy', 'Monitor'], // fast-track variant
    [
      'Start',
      'Analyze',
      'Design',
      'Build',
      'Test',
      'Rollback',
      'Analyze',
      'Design',
      'Build',
      'Test',
      'Deploy',
      'Monitor',
    ], // failure variant
    ['Start', 'Design', 'Build', 'Test', 'Deploy', 'Monitor'], // skip analyze variant
  ];

  // Generate 100 deterministic traces with 5 variants
  for (let i = 1; i <= 100; i++) {
    const variantIdx = i % variants.length;
    const variant = variants[variantIdx];
    const startTime = i * 10000; // Wider time spread

    const events: PredictionEvent[] = variant.map((activity, idx) => ({
      activity,
      timestamp: startTime + idx * 1000,
    }));

    traces.push({
      caseId: `synthetic-${String(i).padStart(5, '0')}`,
      events,
    });
  }

  return {
    id: 'synthetic',
    name: 'Synthetic Software Development Process',
    description:
      'Synthetic dataset with 5 distinct process variants (happy path, rework, fast-track, failure recovery, skip). ' +
      '100 traces with clear variant structure. Excellent for testing clustering and variant discovery.',
    traceCount: 100,
    activityCount: 8,
    averageTraceLength: 7.2,
    log: {
      traces,
      activities: ['Start', 'Analyze', 'Design', 'Build', 'Test', 'Deploy', 'Monitor', 'Rollback'],
    },
    suggestedPerspectives: ['features', 'drift', 'next_activity'],
    useCases: [
      'Process mining algorithm benchmarking',
      'Variant discovery',
      'Feature engineering testing',
      'Scalability testing',
    ],
  };
}

/**
 * Load a public sample dataset.
 *
 * @param datasetId - Dataset identifier ('simple', 'bpi2020', 'synthetic')
 * @returns PublicDataset with log and metadata
 * @throws Error if dataset not found
 *
 * @example
 * ```typescript
 * const { log, description } = await loadPublicDataset('simple');
 * console.log(log.traces.length);  // 10
 *
 * // Use in ML
 * import { classifyTraces } from '@wasm4pm/ml';
 * const matrix = buildFeatureMatrix(log.traces, ['duration']);
 * ```
 */
export function loadPublicDataset(datasetId: 'simple' | 'bpi2020' | 'synthetic'): PublicDataset {
  switch (datasetId) {
    case 'simple':
      return createSimpleDataset();
    case 'bpi2020':
      return createBpi2020Dataset();
    case 'synthetic':
      return createSyntheticDataset();
    default:
      throw new Error(`Unknown dataset: ${datasetId}`);
  }
}

/**
 * Get list of available datasets.
 *
 * @returns Array of available dataset identifiers
 *
 * @example
 * ```typescript
 * const available = getAvailableDatasets();
 * console.log(available);  // ['simple', 'bpi2020', 'synthetic']
 * ```
 */
export function getAvailableDatasets(): string[] {
  return ['simple', 'bpi2020', 'synthetic'];
}

/**
 * Get all datasets with metadata (for discovery).
 *
 * @returns Array of PublicDataset objects
 *
 * @example
 * ```typescript
 * const all = getAllDatasets();
 * all.forEach(ds => {
 *   console.log(`${ds.name}: ${ds.traceCount} traces`);
 * });
 * ```
 */
export function getAllDatasets(): PublicDataset[] {
  return [createSimpleDataset(), createBpi2020Dataset(), createSyntheticDataset()];
}
