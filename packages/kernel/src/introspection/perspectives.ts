/**
 * introspection/perspectives.ts
 *
 * Prediction perspective discovery and metadata registry.
 * Provides introspection APIs for all 6 Van der Aalst prediction perspectives.
 *
 * Domain oracle: Perspectives are derived from Van der Aalst formalism (Rank 1: mathematical theorem).
 */

import { PredictionPerspective, ALL_PREDICTION_PERSPECTIVES } from '../prediction/types.js';

/**
 * Metadata for a single prediction perspective.
 */
export interface PerspectiveMetadata {
  /** Perspective ID (one of the 6 Van der Aalst perspectives) */
  id: PredictionPerspective;

  /** Display name */
  name: string;

  /** What question does this perspective answer? */
  question: string;

  /** Long description */
  description: string;

  /** Input: what data is required? */
  inputs: {
    /** Event log format required */
    logFormat: 'trace_sequence' | 'event_attributes' | 'numeric_series';
    /** Typical attributes needed */
    requiredAttributes: string[];
    /** Optional attributes that improve accuracy */
    optionalAttributes: string[];
  };

  /** Output: what does this perspective produce? */
  outputs: {
    /** Type of prediction output */
    outputType: string;
    /** Example output structure description */
    exampleOutput: string;
  };

  /** Algorithm characteristics */
  characteristics: {
    /** Speed estimate (0-100, lower = faster) */
    speedEstimate: number;
    /** Accuracy/confidence estimate (0-100) */
    accuracyEstimate: number;
    /** Minimum traces needed for training */
    minTrainTraces: number;
    /** Scales well to large logs? */
    scalesWell: boolean;
  };

  /** Use cases where this perspective is most valuable */
  useCases: string[];

  /** Key parameters and their defaults */
  parameters: {
    /** Parameter name */
    name: string;
    /** Parameter description */
    description: string;
    /** Parameter type */
    type: 'number' | 'string' | 'select' | 'boolean';
    /** Default value */
    default: unknown;
    /** Valid range or options */
    constraint?: string;
  }[];

  /** Academic references */
  references?: string[];

  /** Example task configuration */
  exampleConfig: Record<string, unknown>;
}

/**
 * Registry for prediction perspectives.
 */
class PerspectiveRegistry {
  private perspectives: Map<PredictionPerspective, PerspectiveMetadata> = new Map();

  constructor() {
    this.registerAllPerspectives();
  }

  /**
   * Register all 6 Van der Aalst prediction perspectives.
   */
  private registerAllPerspectives(): void {
    // Next Activity
    this.register({
      id: 'next_activity',
      name: 'Next Activity',
      question: 'What is the next activity likely to occur?',
      description:
        'Predicts the most probable next activity (action) in a process instance, given the prefix (history so far). ' +
        'Uses n-gram language models trained on activity sequences. Returns top-k predictions with confidence scores.',
      inputs: {
        logFormat: 'trace_sequence',
        requiredAttributes: ['activity', 'timestamp'],
        optionalAttributes: ['resource', 'case_duration'],
      },
      outputs: {
        outputType: 'ranked_predictions',
        exampleOutput: '[ {activity: "Approve", confidence: 0.92}, {activity: "Reject", confidence: 0.07}, ... ]',
      },
      characteristics: {
        speedEstimate: 20,
        accuracyEstimate: 75,
        minTrainTraces: 50,
        scalesWell: true,
      },
      useCases: [
        'Process automation (predict next step)',
        'Resource allocation (route to next performer)',
        'Process optimization (identify bottleneck activities)',
        'Process deviation detection (unexpected next activity)',
        'Real-time case monitoring',
      ],
      parameters: [
        {
          name: 'ngramOrder',
          description: 'Context window size (number of recent activities to consider)',
          type: 'number',
          default: 2,
          constraint: '1-8',
        },
        {
          name: 'topK',
          description: 'Number of predictions to return',
          type: 'number',
          default: 3,
          constraint: '1-20',
        },
        {
          name: 'activityKey',
          description: 'Event attribute key for activity names',
          type: 'string',
          default: 'concept:name',
        },
      ],
      exampleConfig: {
        perspective: 'next_activity',
        ngramOrder: 2,
        topK: 3,
      },
    });

    // Remaining Time
    this.register({
      id: 'remaining_time',
      name: 'Remaining Time',
      question: 'How much longer will this case take to complete?',
      description:
        'Estimates the remaining execution time until process completion, given the current prefix. ' +
        'Uses Weibull regression on trace duration distributions and activity timestamps. ' +
        'Returns point estimate and confidence interval.',
      inputs: {
        logFormat: 'event_attributes',
        requiredAttributes: ['activity', 'timestamp'],
        optionalAttributes: ['resource', 'effort', 'priority'],
      },
      outputs: {
        outputType: 'numeric_estimate',
        exampleOutput: '{ remaining_ms: 3600000, confidence: 0.85, lowerBound: 2400000, upperBound: 5000000 }',
      },
      characteristics: {
        speedEstimate: 25,
        accuracyEstimate: 70,
        minTrainTraces: 100,
        scalesWell: true,
      },
      useCases: [
        'SLA monitoring (alert if completion at risk)',
        'Resource scheduling (predict when case finishes)',
        'Cost estimation (project time-based charges)',
        'Queue management (predict service levels)',
        'Bottleneck analysis (slow activities)',
      ],
      parameters: [
        {
          name: 'aggregator',
          description: 'How to aggregate baseline durations',
          type: 'select',
          default: 'mean',
          constraint: 'mean|median',
        },
        {
          name: 'activityKey',
          description: 'Event attribute key for activity names',
          type: 'string',
          default: 'concept:name',
        },
      ],
      exampleConfig: {
        perspective: 'remaining_time',
        aggregator: 'mean',
      },
    });

    // Outcome
    this.register({
      id: 'outcome',
      name: 'Outcome',
      question: 'What will be the final outcome of this case (e.g., approved/rejected)?',
      description:
        'Predicts the ultimate outcome (terminal state) of a process instance, given its prefix. ' +
        'Uses supervised learning on completed traces with known outcomes. Returns predicted outcome with confidence.',
      inputs: {
        logFormat: 'trace_sequence',
        requiredAttributes: ['activity', 'outcome'],
        optionalAttributes: ['resource', 'cost', 'timestamp'],
      },
      outputs: {
        outputType: 'classification',
        exampleOutput: '{ outcome: "Approved", confidence: 0.88, alternatives: [{outcome: "Rejected", confidence: 0.12}] }',
      },
      characteristics: {
        speedEstimate: 35,
        accuracyEstimate: 80,
        minTrainTraces: 200,
        scalesWell: true,
      },
      useCases: [
        'Early warning (identify risky cases before completion)',
        'Decision support (recommend approval/rejection)',
        'Process simulation (Monte Carlo outcome distribution)',
        'Quality prediction (success rate forecasting)',
        'Resource optimization (allocate based on predicted outcome)',
      ],
      parameters: [
        {
          name: 'outcomes',
          description: 'Universe of legal outcome labels',
          type: 'string',
          default: '',
          constraint: 'inferred from training log if omitted',
        },
        {
          name: 'activityKey',
          description: 'Event attribute key for activity names',
          type: 'string',
          default: 'concept:name',
        },
      ],
      exampleConfig: {
        perspective: 'outcome',
      },
    });

    // Drift
    this.register({
      id: 'drift',
      name: 'Drift (Process Change)',
      question: 'Is the process behavior changing over time (concept drift)?',
      description:
        'Detects when process behavior deviates from baseline (concept drift). ' +
        'Uses EWMA smoothing over Jaccard similarity of trace fingerprints. ' +
        'Emits drift score and alerts when threshold is crossed.',
      inputs: {
        logFormat: 'trace_sequence',
        requiredAttributes: ['activity', 'timestamp'],
        optionalAttributes: ['case_attributes'],
      },
      outputs: {
        outputType: 'drift_score',
        exampleOutput: '{ driftScore: 0.23, drifting: true, windowSize: 50, baseline: 0.75 }',
      },
      characteristics: {
        speedEstimate: 15,
        accuracyEstimate: 75,
        minTrainTraces: 30,
        scalesWell: true,
      },
      useCases: [
        'Process monitoring (real-time deviation detection)',
        'Change management (detect when process is modified)',
        'Quality assurance (alert on unexpected behavior change)',
        'Compliance verification (ensure process remains in control)',
        'Incident response (trigger investigation on drift alert)',
      ],
      parameters: [
        {
          name: 'windowSize',
          description: 'Sliding window size (number of traces)',
          type: 'number',
          default: 50,
          constraint: '5-10000',
        },
        {
          name: 'ewmaAlpha',
          description: 'Exponential smoothing factor (0-1, higher = more reactive)',
          type: 'number',
          default: 0.3,
          constraint: '(0, 1]',
        },
        {
          name: 'driftThreshold',
          description: 'Jaccard similarity below this triggers drift alert',
          type: 'number',
          default: 0.7,
          constraint: '[0, 1]',
        },
      ],
      exampleConfig: {
        perspective: 'drift',
        windowSize: 50,
        ewmaAlpha: 0.3,
        driftThreshold: 0.7,
      },
    });

    // Features (Prefix Features)
    this.register({
      id: 'features',
      name: 'Features (Prefix Characteristics)',
      question: 'What are the characteristic features of this case so far?',
      description:
        'Extracts and computes prefix-level features (activity count, rework, path length, resource diversity). ' +
        'Useful as input to downstream ML models (classification, anomaly detection). ' +
        'Returns feature vector with interpretable names.',
      inputs: {
        logFormat: 'trace_sequence',
        requiredAttributes: ['activity', 'resource', 'timestamp'],
        optionalAttributes: ['cost', 'effort'],
      },
      outputs: {
        outputType: 'feature_vector',
        exampleOutput: '{ activity_count: 5, rework_score: 0.2, path_uniqueness: 0.8, resource_diversity: 3 }',
      },
      characteristics: {
        speedEstimate: 10,
        accuracyEstimate: 90, // deterministic extraction, not probabilistic
        minTrainTraces: 1,
        scalesWell: true,
      },
      useCases: [
        'Feature engineering (input to other ML models)',
        'Case complexity analysis',
        'Workload characterization',
        'Pattern discovery',
        'Anomaly detection input',
      ],
      parameters: [
        {
          name: 'includeRework',
          description: 'Include rework/loop indicators',
          type: 'boolean',
          default: true,
        },
        {
          name: 'activityKey',
          description: 'Event attribute key for activity names',
          type: 'string',
          default: 'concept:name',
        },
      ],
      exampleConfig: {
        perspective: 'features',
        includeRework: true,
      },
    });

    // Resource
    this.register({
      id: 'resource',
      name: 'Resource (Next Performer)',
      question: 'Who should handle the next step (which resource/performer)?',
      description:
        'Recommends the next resource (performer, department, system) for a case, given its history. ' +
        'Uses Multi-Armed Bandit (UCB1) on resource allocation patterns. ' +
        'Balances exploration (try new resources) vs exploitation (use proven resources).',
      inputs: {
        logFormat: 'event_attributes',
        requiredAttributes: ['activity', 'resource', 'timestamp'],
        optionalAttributes: ['outcome', 'cost', 'effort'],
      },
      outputs: {
        outputType: 'resource_recommendation',
        exampleOutput: '{ recommendedResource: "Bob", confidence: 0.92, alternatives: [{resource: "Alice", confidence: 0.08}] }',
      },
      characteristics: {
        speedEstimate: 30,
        accuracyEstimate: 65,
        minTrainTraces: 100,
        scalesWell: true,
      },
      useCases: [
        'Resource routing (assign next task to best performer)',
        'Load balancing (distribute work across team)',
        'Performance optimization (route to faster workers)',
        'Skill development (route to learning resources)',
        'Cost optimization (prefer cheaper resources)',
      ],
      parameters: [
        {
          name: 'ucbC',
          description: 'Exploration constant for UCB1 bandit',
          type: 'number',
          default: 1.414, // sqrt(2)
          constraint: '0.1-3.0',
        },
        {
          name: 'activityKey',
          description: 'Event attribute key for activity names',
          type: 'string',
          default: 'concept:name',
        },
      ],
      exampleConfig: {
        perspective: 'resource',
        ucbC: 1.414,
      },
    });
  }

  /**
   * Register a prediction perspective.
   */
  private register(metadata: PerspectiveMetadata): void {
    this.perspectives.set(metadata.id, metadata);
  }

  /**
   * Get metadata for a specific perspective.
   *
   * @param id - Perspective ID
   * @returns Perspective metadata, or undefined if not found
   *
   * @example
   * ```typescript
   * const meta = registry.getPerspectiveMetadata('next_activity');
   * console.log(meta.name);       // "Next Activity"
   * console.log(meta.question);   // "What is the next activity...?"
   * ```
   */
  public getPerspectiveMetadata(id: PredictionPerspective): PerspectiveMetadata | undefined {
    return this.perspectives.get(id);
  }

  /**
   * Get all 6 prediction perspectives.
   *
   * @returns Array of all perspective metadata
   *
   * @example
   * ```typescript
   * const all = registry.getAllPerspectives();
   * console.log(all.length);  // 6
   * all.forEach(p => console.log(p.name));
   * ```
   */
  public getAllPerspectives(): PerspectiveMetadata[] {
    return Array.from(ALL_PREDICTION_PERSPECTIVES)
      .map((id) => this.perspectives.get(id)!)
      .filter((p): p is PerspectiveMetadata => p !== undefined);
  }

  /**
   * Get perspectives suitable for a specific use case.
   *
   * Domain oracle: Use case mapping based on Van der Aalst formalism (Rank 2: domain contract).
   *
   * @param useCase - Use case (e.g., "resource_routing", "risk_mitigation")
   * @returns Matching perspectives
   *
   * @example
   * ```typescript
   * const perspectives = registry.getPerspectivesForUseCase('resource_routing');
   * console.log(perspectives);  // [next_activity, resource]
   * ```
   */
  public getPerspectivesForUseCase(useCase: string): PredictionPerspective[] {
    const useCaseMap: Record<string, PredictionPerspective[]> = {
      resource_routing: ['next_activity', 'resource'],
      risk_mitigation: ['outcome', 'drift'],
      timeline_tracking: ['remaining_time', 'next_activity'],
      quality_control: ['drift', 'outcome'],
      process_monitoring: ['drift', 'features'],
      workload_prediction: ['remaining_time'],
      automation: ['next_activity', 'outcome'],
      resource_planning: ['resource', 'remaining_time'],
    };

    return useCaseMap[useCase] || [];
  }

  /**
   * Get example configuration for a perspective.
   *
   * @param id - Perspective ID
   * @returns Example task config with sensible defaults, or undefined if not found
   *
   * @example
   * ```typescript
   * const config = registry.getExampleConfig('next_activity');
   * console.log(config);  // { perspective: 'next_activity', ngramOrder: 2, topK: 3 }
   * ```
   */
  public getExampleConfig(id: PredictionPerspective): Record<string, unknown> | undefined {
    const perspective = this.perspectives.get(id);
    return perspective?.exampleConfig;
  }
}

/**
 * Singleton instance of the prediction perspective registry.
 */
let instance: PerspectiveRegistry | undefined;

/**
 * Get the global prediction perspective registry.
 *
 * @returns Singleton instance
 *
 * @example
 * ```typescript
 * import { getPerspectiveRegistry } from '@wasm4pm/kernel/introspection';
 * const registry = getPerspectiveRegistry();
 * const meta = registry.getPerspectiveMetadata('next_activity');
 * ```
 */
export function getPerspectiveRegistry(): PerspectiveRegistry {
  if (!instance) {
    instance = new PerspectiveRegistry();
  }
  return instance;
}

/**
 * Reset the registry (for testing).
 */
export function _resetPerspectiveRegistry(): void {
  instance = undefined;
}
