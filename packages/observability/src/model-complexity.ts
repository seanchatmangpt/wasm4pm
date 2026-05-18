/**
 * model-complexity.ts
 * Model structural complexity assessment and quality aggregation
 *
 * Provides:
 * - `computeComplexity(model)` → ComplexityScore (0-1, lower is simpler)
 * - `computeQualitySummary(fitness, precision, generalization, simplicity)` → overall score
 * - `analyzeModelStructure(model)` → detailed complexity breakdown
 * - `rankModelsByComplexity(models)` → ranked by simplicity
 *
 * Metrics included:
 * - Place count (Petri nets only)
 * - Transition count
 * - Arc density (edges / (nodes * (nodes - 1)))
 * - Cyclomatic complexity (edges - nodes + 2)
 * - Element count normalized [0-1]
 *
 * Per Van der Aalst: Simplicity is the inverse of element count.
 * A model with fewer places and transitions is simpler and more interpretable.
 */

import type { QualityMetrics } from './feedback-loop.js';

/**
 * Node in the process model graph (place, transition, activity, etc.).
 */
export interface ModelNode {
  id: string;
  label: string;
  type: string; // "place", "transition", "activity", "gateway", etc.
}

/**
 * Edge in the process model graph (flow, arc, directly-follows, etc.).
 */
export interface ModelEdge {
  from: string;
  to: string;
  weight?: number;
}

/**
 * Process model in intermediate representation.
 * Simplified version for complexity analysis (no capabilities field required).
 */
export interface ModelIR {
  format_version?: '1.0';
  model_type: 'dfg' | 'petri_net' | 'process_tree' | 'declare' | 'powl';
  algorithm_id: string;
  nodes: ReadonlyArray<ModelNode>;
  edges: ReadonlyArray<ModelEdge>;
  quality?: QualityMetrics;
}

/**
 * Complexity assessment of a process model
 */
export interface ComplexityScore {
  // Structural metrics
  placeCount: number; // Only for Petri nets
  transitionCount: number; // Activities in DFG, transitions in Petri nets
  arcCount: number; // Edges in the model
  arcDensity: number; // edges / (nodes * (nodes - 1))
  cyclomaticComplexity: number; // edges - nodes + 2
  nodeCount: number; // Total nodes (places + transitions)

  // Composite complexity score [0, 1]
  // 0 = simplest (linear, single-step process)
  // 1 = most complex (heavily branched, cyclic)
  complexityScore: number;

  // Inverse of complexity: higher = simpler
  simplicityScore: number; // [0, 1], 1 = simplest

  // Assessment
  assessment: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';
}

/**
 * Overall quality summary combining 4 dimensions
 */
export interface QualitySummary {
  // The 4 dimensions (all [0, 1])
  fitness: number;
  precision: number;
  generalization: number;
  simplicity: number;

  // Aggregate score (weighted average)
  // Formula: 0.35*fitness + 0.30*precision + 0.20*generalization + 0.15*simplicity
  overallScore: number;

  // Classification
  verdict: 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | 'poor';

  // Human-readable report
  summary: string;
}

/**
 * Model structure analysis
 */
export interface ModelStructureAnalysis {
  modelType: string;
  algorithmId: string;
  complexity: ComplexityScore;
  quality?: QualityMetrics;
  assessment: string; // Detailed human-readable assessment
}

/**
 * Compute model complexity from structural metrics
 *
 * Simplicity is inverse of element count:
 * - Linear process (1 activity): simplicity = 1.0
 * - 5 activities: simplicity ≈ 0.8
 * - 20 activities: simplicity ≈ 0.5
 * - 100+ activities: simplicity < 0.1
 *
 * Formula:
 * 1. Normalize element count: norm = (placeCount + transitionCount) / 100 (clamped [0,1])
 * 2. Cyclomatic complexity component: cc_norm = min(cc, 50) / 50
 * 3. Density component: density_norm = arcDensity
 * 4. Composite: complexityScore = 0.5*norm + 0.3*cc_norm + 0.2*density_norm
 * 5. Simplicity = 1 - complexityScore
 *
 * @param model Process model (DFG, Petri net, process tree, etc.)
 * @returns Complexity assessment
 */
export function computeComplexity(model: ModelIR): ComplexityScore {
  const nodeCount = model.nodes.length;
  const arcCount = model.edges.length;

  // Count places and transitions (for Petri nets)
  const placeCount = model.nodes.filter((n) => n.type === 'place').length;
  const transitionCount = nodeCount - placeCount;

  // Arc density: edges / (nodes * (nodes - 1))
  // For a complete directed graph: max edges = n*(n-1)
  const maxEdges = nodeCount > 1 ? nodeCount * (nodeCount - 1) : 1;
  const arcDensity = arcCount / maxEdges;

  // Cyclomatic complexity: m - n + 2p (for connected components, p=1)
  // m = edges, n = nodes, p = connected components
  const cyclomaticComplexity = arcCount - nodeCount + 2;

  // Normalize element count: scale to [0, 1] where 100 is "maximum expected"
  // This represents a model with many elements as complex
  const elementCount: number = nodeCount;
  const elementNorm = Math.min(elementCount / 100, 1.0);

  // Cyclomatic complexity normalized: max ~50 is very complex
  const ccNorm = Math.min(cyclomaticComplexity, 50) / 50;

  // Composite complexity score
  // Weights: element count 50%, cyclomatic 30%, density 20%
  const complexityScore = 0.5 * elementNorm + 0.3 * ccNorm + 0.2 * arcDensity;

  // Simplicity is the inverse
  const simplicityScore = 1.0 - Math.min(complexityScore, 1.0);

  // Determine assessment category
  let assessment: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';
  if (complexityScore < 0.2) {
    assessment = 'trivial';
  } else if (complexityScore < 0.4) {
    assessment = 'simple';
  } else if (complexityScore < 0.6) {
    assessment = 'moderate';
  } else if (complexityScore < 0.8) {
    assessment = 'complex';
  } else {
    assessment = 'very_complex';
  }

  return {
    placeCount,
    transitionCount,
    arcCount,
    arcDensity,
    cyclomaticComplexity,
    nodeCount,
    complexityScore,
    simplicityScore,
    assessment,
  };
}

/**
 * Compute overall quality summary from 4 dimensions
 *
 * Weights:
 * - Fitness: 35% (most important: does model match observed behavior?)
 * - Precision: 30% (second most: avoids overfitting)
 * - Generalization: 20% (avoids underfitting)
 * - Simplicity: 15% (interpretability)
 *
 * Verdicts:
 * - excellent: >= 0.90
 * - good: >= 0.75
 * - acceptable: >= 0.60
 * - needs_improvement: >= 0.45
 * - poor: < 0.45
 *
 * @param fitness Model fitness [0, 1]
 * @param precision Model precision [0, 1]
 * @param generalization Model generalization [0, 1]
 * @param simplicity Model simplicity [0, 1]
 * @returns Quality summary with verdict
 */
export function computeQualitySummary(
  fitness: number,
  precision: number,
  generalization: number,
  simplicity: number
): QualitySummary {
  // Clamp all inputs to [0, 1]
  const f = Math.max(0, Math.min(1, fitness));
  const p = Math.max(0, Math.min(1, precision));
  const g = Math.max(0, Math.min(1, generalization));
  const s = Math.max(0, Math.min(1, simplicity));

  // Weighted average: fitness 35%, precision 30%, generalization 20%, simplicity 15%
  const overallScore = 0.35 * f + 0.3 * p + 0.2 * g + 0.15 * s;

  // Determine verdict
  let verdict: 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | 'poor';
  if (overallScore >= 0.9) {
    verdict = 'excellent';
  } else if (overallScore >= 0.75) {
    verdict = 'good';
  } else if (overallScore >= 0.6) {
    verdict = 'acceptable';
  } else if (overallScore >= 0.45) {
    verdict = 'needs_improvement';
  } else {
    verdict = 'poor';
  }

  // Generate summary string
  const summary = generateQualitySummary(f, p, g, s, overallScore, verdict);

  return {
    fitness: f,
    precision: p,
    generalization: g,
    simplicity: s,
    overallScore,
    verdict,
    summary,
  };
}

/**
 * Generate human-readable quality summary
 */
function generateQualitySummary(
  fitness: number,
  precision: number,
  generalization: number,
  simplicity: number,
  overall: number,
  verdict: string
): string {
  const parts: string[] = [];

  parts.push(`Model quality: fitness=${fitness.toFixed(2)}, precision=${precision.toFixed(2)}, ` +
    `generalization=${generalization.toFixed(2)}, simplicity=${simplicity.toFixed(2)} → overall=${overall.toFixed(2)}`);

  parts.push(`Verdict: ${verdict.toUpperCase()}`);

  // Add specific observations
  if (fitness < 0.7) {
    parts.push('Note: Low fitness suggests model does not capture observed behavior well.');
  }
  if (precision < 0.7) {
    parts.push('Note: Low precision suggests model is overfitting or too specific.');
  }
  if (generalization < 0.6) {
    parts.push('Note: Low generalization suggests model may not generalize well to unseen behavior.');
  }
  if (simplicity < 0.5) {
    parts.push('Note: Low simplicity suggests model is complex and may be hard to interpret.');
  }

  return parts.join(' ');
}

/**
 * Analyze full model structure with quality metrics
 *
 * @param model Process model
 * @returns Detailed analysis
 */
export function analyzeModelStructure(model: ModelIR): ModelStructureAnalysis {
  const complexity = computeComplexity(model);

  // Build assessment string
  const assessmentParts: string[] = [];
  assessmentParts.push(`Model: ${model.model_type} (${model.algorithm_id})`);
  assessmentParts.push(
    `Structure: ${complexity.nodeCount} nodes, ${complexity.arcCount} edges`
  );
  assessmentParts.push(
    `Complexity: ${complexity.complexityScore.toFixed(2)} (${complexity.assessment})`
  );
  assessmentParts.push(`Cyclomatic: ${complexity.cyclomaticComplexity}`);
  assessmentParts.push(`Arc density: ${complexity.arcDensity.toFixed(3)}`);

  // Add quality assessment if available
  if (model.quality) {
    const fitness = model.quality.fitness ?? 0;
    const precision = model.quality.precision ?? 0;
    const generalization = model.quality.generalization ?? 0;
    const simplicity = complexity.simplicityScore;

    const qualitySummary = computeQualitySummary(fitness, precision, generalization, simplicity);
    assessmentParts.push(`Quality: ${qualitySummary.verdict.toUpperCase()}`);
    assessmentParts.push(
      `Fitness: ${fitness.toFixed(2)}, Precision: ${precision.toFixed(2)}, ` +
      `Generalization: ${generalization.toFixed(2)}, Simplicity: ${simplicity.toFixed(2)}`
    );
  }

  return {
    modelType: model.model_type,
    algorithmId: model.algorithm_id,
    complexity,
    quality: model.quality,
    assessment: assessmentParts.join('\n'),
  };
}

/**
 * Rank multiple models by complexity (simplicity)
 * Returns models sorted by simplicity score descending (simplest first)
 *
 * @param models Array of models to rank
 * @returns Models with complexity scores, sorted by simplicity
 */
export interface RankedModel {
  model: ModelIR;
  complexity: ComplexityScore;
  rank: number; // 1 = simplest
}

export function rankModelsByComplexity(models: ModelIR[]): RankedModel[] {
  const ranked = models.map((model, index) => ({
    model,
    complexity: computeComplexity(model),
    originalIndex: index,
  }));

  // Sort by simplicity score descending (higher simplicity = lower rank number)
  ranked.sort((a, b) => b.complexity.simplicityScore - a.complexity.simplicityScore);

  return ranked.map((item, index) => ({
    model: item.model,
    complexity: item.complexity,
    rank: index + 1,
  }));
}

/**
 * Format complexity score for human consumption
 */
export function formatComplexityScore(score: ComplexityScore): string {
  return (
    `Complexity: ${score.complexityScore.toFixed(2)} (${score.assessment})\n` +
    `Simplicity: ${score.simplicityScore.toFixed(2)}\n` +
    `Nodes: ${score.nodeCount}, Edges: ${score.arcCount}\n` +
    `Cyclomatic: ${score.cyclomaticComplexity}, Density: ${score.arcDensity.toFixed(3)}`
  );
}

/**
 * Format quality summary for human consumption
 */
export function formatQualitySummary(summary: QualitySummary): string {
  return (
    `Quality Assessment: ${summary.verdict.toUpperCase()}\n` +
    `Fitness: ${summary.fitness.toFixed(2)} | Precision: ${summary.precision.toFixed(2)} | ` +
    `Generalization: ${summary.generalization.toFixed(2)} | Simplicity: ${summary.simplicity.toFixed(2)}\n` +
    `Overall Score: ${summary.overallScore.toFixed(2)}\n` +
    summary.summary
  );
}
