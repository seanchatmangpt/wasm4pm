/**
 * introspection/algorithms.ts
 *
 * ML algorithm discovery and metadata registry.
 * Provides introspection APIs for all @wasm4pm/ml algorithms.
 *
 * Domain oracle: Algorithm characteristics are derived from published
 * ml-rl-testing.md specifications (Rank 1: mathematical theorem).
 */

/**
 * ML algorithm identifier.
 */
export type MlAlgorithmId = 'classify' | 'cluster' | 'forecast' | 'anomaly' | 'regress' | 'pca';

/**
 * Classification method.
 */
export type ClassificationMethod = 'knn' | 'logistic_regression' | 'decision_tree' | 'naive_bayes';

/**
 * Clustering method.
 */
export type ClusteringMethod = 'kmeans' | 'dbscan';

/**
 * Regression method.
 */
export type RegressionMethod =
  | 'linear_regression'
  | 'polynomial_regression'
  | 'exponential_regression';

/**
 * Forecasting method.
 */
export type ForecastingMethod = 'exponential_smoothing' | 'decomposition';

/**
 * ML algorithm metadata: speed, quality, inputs, outputs, parameters.
 */
export interface MlAlgorithmMetadata {
  /** Unique algorithm identifier */
  id: MlAlgorithmId;

  /** Display name */
  name: string;

  /** Long description of what this algorithm does */
  description: string;

  /** Input type: what kind of data does it accept? */
  inputType: 'trace_features' | 'event_log' | 'numeric_series' | 'feature_matrix';

  /** Output type: what does it return? */
  outputType:
    | 'predictions'
    | 'cluster_assignments'
    | 'anomaly_scores'
    | 'forecast'
    | 'reduced_features';

  /** Speed estimate: 0-100 (lower = faster) */
  speedEstimate: number; // 0-30: fast, 30-60: moderate, 60+: slow

  /** Quality estimate: 0-100 (higher = better accuracy) */
  qualityEstimate: number; // 0-40: basic, 40-70: good, 70+: high

  /** Use cases and domains where this algorithm shines */
  useCases: string[];

  /** Estimated duration per 1000 events in milliseconds */
  estimatedDurationMs: number;

  /** Estimated memory usage in MB for typical log */
  estimatedMemoryMB: number;

  /** Whether this handles missing data well */
  robustToMissingData: boolean;

  /** Whether this scales to 100k+ events */
  scalesWell: boolean;

  /** Parameters this algorithm accepts */
  parameters: AlgorithmParameter[];

  /** Which ML subdomains this algorithm is part of */
  category:
    | 'classification'
    | 'clustering'
    | 'forecasting'
    | 'anomaly_detection'
    | 'regression'
    | 'dimensionality_reduction';

  /** Academic references or papers */
  references?: string[];

  /** Example configuration (domain default parameters) */
  exampleConfig: Record<string, unknown>;
}

/**
 * Parameter definition for an ML algorithm.
 */
export interface AlgorithmParameter {
  /** Parameter name */
  name: string;

  /** Parameter type */
  type: 'number' | 'string' | 'select' | 'boolean';

  /** Human description */
  description: string;

  /** Is this parameter required? */
  required: boolean;

  /** Default value */
  default?: unknown;

  /** Minimum value (for numeric types) */
  min?: number;

  /** Maximum value (for numeric types) */
  max?: number;

  /** Valid options (for 'select' type) */
  options?: unknown[];

  /** Domain interpretation */
  domainHint?: string;
}

/**
 * Algorithm metadata registry for @wasm4pm/ml algorithms.
 */
class MlAlgorithmRegistry {
  private algorithms: Map<MlAlgorithmId, MlAlgorithmMetadata> = new Map();

  constructor() {
    this.registerAllAlgorithms();
  }

  /**
   * Register all @wasm4pm/ml algorithms.
   * Source: ml-rl-testing.md specification (statistical oracle, Rank 1-2).
   */
  private registerAllAlgorithms(): void {
    // Classification
    this.register({
      id: 'classify',
      name: 'Classification',
      description:
        'Classify traces or prefix states into discrete outcomes. Supports KNN, Logistic Regression, Decision Tree, Naive Bayes. ' +
        'Use for: outcome prediction, case categorization, risk stratification.',
      inputType: 'feature_matrix',
      outputType: 'predictions',
      speedEstimate: 40,
      qualityEstimate: 60,
      useCases: [
        'Predicting case outcome (success/failure)',
        'Risk classification',
        'Process variant detection',
        'Resource routing decisions',
      ],
      estimatedDurationMs: 5, // per 1000 events
      estimatedMemoryMB: 50,
      robustToMissingData: false,
      scalesWell: true,
      category: 'classification',
      parameters: [
        {
          name: 'method',
          type: 'select',
          description: 'Classification algorithm',
          required: true,
          default: 'decision_tree',
          options: ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'],
          domainHint:
            'KNN sensitive to feature scaling; Logistic good for linear boundaries; Tree handles nonlinear patterns',
        },
        {
          name: 'kValue',
          type: 'number',
          description: 'K for KNN algorithm (number of nearest neighbors)',
          required: false,
          default: 3,
          min: 1,
          max: 50,
          domainHint: 'Lower K = more sensitive to outliers; Higher K = smoother boundaries',
        },
        {
          name: 'testSplit',
          type: 'number',
          description: 'Train/test split ratio (0-1)',
          required: false,
          default: 0.2,
          min: 0.05,
          max: 0.5,
          domainHint: 'Higher split ratio tests on larger data but trains on less',
        },
      ],
      exampleConfig: {
        method: 'decision_tree',
        testSplit: 0.2,
      },
    });

    // Clustering
    this.register({
      id: 'cluster',
      name: 'Clustering',
      description:
        'Group traces into clusters based on behavioral similarity. Supports K-means and DBSCAN. ' +
        'Use for: process variant discovery, behavioral grouping, homogeneity analysis.',
      inputType: 'feature_matrix',
      outputType: 'cluster_assignments',
      speedEstimate: 35,
      qualityEstimate: 55,
      useCases: [
        'Discovering process variants',
        'Grouping similar behaviors',
        'Outlier detection',
        'Resource pool analysis',
      ],
      estimatedDurationMs: 8, // per 1000 events
      estimatedMemoryMB: 60,
      robustToMissingData: false,
      scalesWell: true,
      category: 'clustering',
      parameters: [
        {
          name: 'method',
          type: 'select',
          description: 'Clustering algorithm',
          required: true,
          default: 'kmeans',
          options: ['kmeans', 'dbscan'],
          domainHint: 'K-means: fast, requires k. DBSCAN: robust to density variance, no k needed',
        },
        {
          name: 'k',
          type: 'number',
          description: 'Number of clusters (for K-means)',
          required: false,
          default: 3,
          min: 2,
          max: 20,
          domainHint: 'Elbow method: find k where inertia increase slows',
        },
        {
          name: 'eps',
          type: 'number',
          description: 'Epsilon: max distance between points (for DBSCAN)',
          required: false,
          default: 0.5,
          min: 0.01,
          max: 5.0,
          domainHint: 'Lower eps = smaller clusters, more noise points',
        },
        {
          name: 'minPts',
          type: 'number',
          description: 'Minimum points in a neighborhood (for DBSCAN)',
          required: false,
          default: 5,
          min: 1,
          max: 50,
          domainHint: 'Lower minPts = easier to form clusters',
        },
      ],
      exampleConfig: {
        method: 'kmeans',
        k: 3,
      },
    });

    // Forecasting
    this.register({
      id: 'forecast',
      name: 'Forecasting',
      description:
        'Predict future values in numeric time series (throughput, cycle time, metrics). ' +
        'Supports exponential smoothing and trend+seasonal decomposition.',
      inputType: 'numeric_series',
      outputType: 'forecast',
      speedEstimate: 30,
      qualityEstimate: 50,
      useCases: [
        'Throughput forecasting',
        'Cycle time prediction',
        'Capacity planning',
        'Trend detection',
        'Seasonality modeling',
      ],
      estimatedDurationMs: 3,
      estimatedMemoryMB: 40,
      robustToMissingData: true,
      scalesWell: true,
      category: 'forecasting',
      parameters: [
        {
          name: 'method',
          type: 'select',
          description: 'Forecasting method',
          required: true,
          default: 'exponential_smoothing',
          options: ['exponential_smoothing', 'decomposition'],
          domainHint: 'EMA: simple, reactive. Decomposition: captures trend+seasonality',
        },
        {
          name: 'alpha',
          type: 'number',
          description: 'EMA smoothing factor (0-1)',
          required: false,
          default: 0.3,
          min: 0.01,
          max: 1.0,
          domainHint: 'Higher α = more reactive to recent changes; Lower = smoother',
        },
        {
          name: 'forecastHorizon',
          type: 'number',
          description: 'How many time periods ahead to forecast',
          required: false,
          default: 10,
          min: 1,
          max: 100,
          domainHint: 'Longer horizon = lower confidence',
        },
      ],
      exampleConfig: {
        method: 'exponential_smoothing',
        alpha: 0.3,
        forecastHorizon: 10,
      },
    });

    // Anomaly Detection
    this.register({
      id: 'anomaly',
      name: 'Anomaly Detection',
      description:
        'Detect unusual patterns or outliers in event logs. Uses EMA smoothing with residual analysis. ' +
        'Use for: identifying exceptional traces, quality control, fraud detection.',
      inputType: 'numeric_series',
      outputType: 'anomaly_scores',
      speedEstimate: 30,
      qualityEstimate: 55,
      useCases: [
        'Detecting exceptional execution paths',
        'Quality control',
        'Fraud detection',
        'Process deviation identification',
        'Real-time alerting',
      ],
      estimatedDurationMs: 4,
      estimatedMemoryMB: 45,
      robustToMissingData: true,
      scalesWell: true,
      category: 'anomaly_detection',
      parameters: [
        {
          name: 'sensitivityFactor',
          type: 'number',
          description: 'Sensitivity to deviations (1-3 sigma levels)',
          required: false,
          default: 2.0,
          min: 0.5,
          max: 4.0,
          domainHint: '2.0 = 95% confidence interval; 3.0 = 99.7%',
        },
        {
          name: 'windowSize',
          type: 'number',
          description: 'Sliding window for trend extraction',
          required: false,
          default: 7,
          min: 2,
          max: 100,
          domainHint: 'Larger window = smoother baseline trend',
        },
      ],
      exampleConfig: {
        sensitivityFactor: 2.0,
        windowSize: 7,
      },
    });

    // Regression
    this.register({
      id: 'regress',
      name: 'Regression',
      description:
        'Predict numeric outcomes (remaining time, effort, cost). Supports linear, polynomial, exponential regression. ' +
        'Use for: remaining time prediction, effort estimation, cost forecasting.',
      inputType: 'feature_matrix',
      outputType: 'predictions',
      speedEstimate: 25,
      qualityEstimate: 50,
      useCases: [
        'Remaining time estimation',
        'Resource cost prediction',
        'Effort forecasting',
        'Timeline projection',
      ],
      estimatedDurationMs: 6,
      estimatedMemoryMB: 55,
      robustToMissingData: false,
      scalesWell: true,
      category: 'regression',
      parameters: [
        {
          name: 'method',
          type: 'select',
          description: 'Regression method',
          required: true,
          default: 'linear_regression',
          options: ['linear_regression', 'polynomial_regression', 'exponential_regression'],
          domainHint:
            'Linear: simple, fast. Polynomial: captures curves. Exponential: for growth patterns',
        },
        {
          name: 'degree',
          type: 'number',
          description: 'Polynomial degree (for polynomial regression)',
          required: false,
          default: 2,
          min: 1,
          max: 5,
          domainHint: 'Higher degree risks overfitting',
        },
      ],
      exampleConfig: {
        method: 'linear_regression',
      },
    });

    // PCA (Principal Component Analysis)
    this.register({
      id: 'pca',
      name: 'Principal Component Analysis (PCA)',
      description:
        'Reduce dimensionality while preserving variance. Useful for visualization and noise reduction. ' +
        'Use for: feature reduction, visualization prep, noise filtering.',
      inputType: 'feature_matrix',
      outputType: 'reduced_features',
      speedEstimate: 35,
      qualityEstimate: 50,
      useCases: [
        'Dimensionality reduction',
        '2D/3D visualization prep',
        'Noise filtering',
        'Feature extraction',
        'Complexity reduction for downstream models',
      ],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 70,
      robustToMissingData: false,
      scalesWell: true,
      category: 'dimensionality_reduction',
      parameters: [
        {
          name: 'nComponents',
          type: 'number',
          description: 'Number of components to retain',
          required: false,
          default: 2,
          min: 1,
          max: 50,
          domainHint: 'Smaller = more compression. Use elbow method to find optimal',
        },
        {
          name: 'explainedVarianceThreshold',
          type: 'number',
          description: 'Target explained variance ratio (0-1)',
          required: false,
          default: 0.95,
          min: 0.5,
          max: 1.0,
          domainHint: 'Higher = retain more information; Lower = more compression',
        },
      ],
      exampleConfig: {
        nComponents: 2,
        explainedVarianceThreshold: 0.95,
      },
    });
  }

  /**
   * Register an ML algorithm.
   */
  private register(metadata: MlAlgorithmMetadata): void {
    this.algorithms.set(metadata.id, metadata);
  }

  /**
   * Get metadata for a specific algorithm.
   *
   * @param id - Algorithm ID
   * @returns Algorithm metadata, or undefined if not found
   *
   * @example
   * ```typescript
   * const meta = registry.getAlgorithmMetadata('classify');
   * console.log(meta.name);           // "Classification"
   * console.log(meta.speedEstimate);  // 40
   * console.log(meta.useCases);       // ["Outcome prediction", ...]
   * ```
   */
  public getAlgorithmMetadata(id: MlAlgorithmId): MlAlgorithmMetadata | undefined {
    return this.algorithms.get(id);
  }

  /**
   * Get all registered ML algorithms.
   *
   * @returns Array of algorithm metadata
   *
   * @example
   * ```typescript
   * const all = registry.getAllAlgorithms();
   * console.log(all.length);  // 6
   * all.forEach(algo => console.log(algo.name));
   * ```
   */
  public getAllAlgorithms(): MlAlgorithmMetadata[] {
    return Array.from(this.algorithms.values());
  }

  /**
   * Get algorithms by category.
   *
   * @param category - Algorithm category
   * @returns Matching algorithms
   *
   * @example
   * ```typescript
   * const classifiers = registry.getByCategory('classification');
   * console.log(classifiers.length);  // 1 (classify)
   * ```
   */
  public getByCategory(category: MlAlgorithmMetadata['category']): MlAlgorithmMetadata[] {
    return Array.from(this.algorithms.values()).filter((a) => a.category === category);
  }

  /**
   * Suggest an algorithm based on use case and constraints.
   *
   * Domain oracle: Algorithm recommendations based on ml-rl-testing.md Rank 2 contracts.
   *
   * @param domain - Problem domain (e.g., "outcome_prediction", "variant_discovery")
   * @param constraints - Constraints (speed, quality, memory budgets)
   * @returns Recommended algorithm, or undefined if no match
   *
   * @example
   * ```typescript
   * const recommended = registry.getSuggestedAlgorithm(
   *   'outcome_prediction',
   *   { speedBudgetMs: 10, qualityTarget: 60 }
   * );
   * console.log(recommended?.id);  // "classify"
   * ```
   */
  public getSuggestedAlgorithm(
    domain: string,
    constraints?: {
      speedBudgetMs?: number;
      qualityTarget?: number;
      memoryBudgetMb?: number;
    }
  ): MlAlgorithmMetadata | undefined {
    const candidates = Array.from(this.algorithms.values());

    // Domain-specific suggestions (Rank 2: domain contract)
    const domainMap: Record<string, MlAlgorithmId[]> = {
      outcome_prediction: ['classify'],
      remaining_time: ['regress'],
      variant_discovery: ['cluster'],
      process_monitoring: ['anomaly', 'forecast'],
      feature_engineering: ['pca'],
      decision_routing: ['classify'],
      quality_control: ['anomaly'],
    };

    const candidates_by_domain =
      domainMap[domain]
        ?.map((id) => this.algorithms.get(id))
        .filter((a): a is MlAlgorithmMetadata => a !== undefined) || candidates;

    // Filter by constraints
    let filtered = candidates_by_domain;
    if (constraints?.speedBudgetMs) {
      // Lower speedEstimate = faster
      filtered = filtered.filter((a) => a.estimatedDurationMs <= constraints.speedBudgetMs!);
    }
    if (constraints?.qualityTarget) {
      filtered = filtered.filter((a) => a.qualityEstimate >= constraints.qualityTarget!);
    }
    if (constraints?.memoryBudgetMb) {
      filtered = filtered.filter((a) => a.estimatedMemoryMB <= constraints.memoryBudgetMb!);
    }

    // Return best match (prefer quality if multiple candidates)
    return filtered.length > 0
      ? filtered.sort((a, b) => b.qualityEstimate - a.qualityEstimate)[0]
      : undefined;
  }

  /**
   * Get example configuration for an algorithm.
   *
   * @param id - Algorithm ID
   * @returns Example config with sensible defaults, or undefined if not found
   *
   * @example
   * ```typescript
   * const config = registry.getExampleConfig('classify');
   * console.log(config);  // { method: 'decision_tree', testSplit: 0.2 }
   * ```
   */
  public getExampleConfig(id: MlAlgorithmId): Record<string, unknown> | undefined {
    const algo = this.algorithms.get(id);
    return algo?.exampleConfig;
  }
}

/**
 * Singleton instance of the ML algorithm registry.
 */
let instance: MlAlgorithmRegistry | undefined;

/**
 * Get the global ML algorithm registry.
 *
 * @returns Singleton instance
 *
 * @example
 * ```typescript
 * import { getMlRegistry } from 'wasm4pm/introspection';
 * const registry = getMlRegistry();
 * const classify = registry.getAlgorithmMetadata('classify');
 * ```
 */
export function getMlRegistry(): MlAlgorithmRegistry {
  if (!instance) {
    instance = new MlAlgorithmRegistry();
  }
  return instance;
}

/**
 * Reset the registry (for testing).
 */
export function _resetMlRegistry(): void {
  instance = undefined;
}
