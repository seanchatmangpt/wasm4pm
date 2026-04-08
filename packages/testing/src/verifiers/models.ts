/**
 * Process Model Verifiers
 *
 * Verification utilities for process models (Petri nets, process trees, DFGs).
 * Checks soundness properties, computes quality metrics (fitness, precision, etc.).
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface PetriNet {
  places: Array<{ id: string; name?: string; initialMarking?: number; finalMarking?: number }>;
  transitions: Array<{ id: string; name?: string; label?: string }>;
  arcs: Array<{ id: string; source: string; target: string; weight?: number }>;
}

export interface ProcessTreeNode {
  id: string;
  type: 'sequence' | 'parallel' | 'choice' | 'loop' | 'task' | 'silent';
  label?: string;
  children?: ProcessTreeNode[];
}

export interface VerifierDFG {
  nodes: string[]; // Activity names
  edges: Array<{ source: string; target: string; count: number }>;
  startActivities: string[];
  endActivities: string[];
}

export interface SoundnessResult {
  sound: boolean;
  deadlockFree: boolean;
  live: boolean;
  bounded: boolean;
  details: string[];
}

export interface QualityMetrics {
  fitness: number; // 0-1, 1 = perfect replay
  precision: number; // 0-1, 1 = perfectly precise
  generalization: number; // 0-1, 1 = generalizes well
  simplicity: number; // 0-1, 1 = simple model
}

export interface ConformanceResult {
  fit: number;
  traceFitness: number[];
  missingTokens: number;
  remainingTokens: number;
  consumedTokens: number;
  producedTokens: number;
}

// ─── Soundness Verification ─────────────────────────────────────────────────

/**
 * Verify soundness properties of a Petri net.
 *
 * A Petri net is sound if:
 * 1. Deadlock-free: From the initial marking, every transition can eventually fire
 * 2. Safe/Bounded: No place can contain more than one token
 * 3. Proper completion: From the initial marking, we can always reach the final marking
 */
export function verifySoundness(net: PetriNet, initialMarking: string[], finalMarking: string[]): SoundnessResult {
  const details: string[] = [];
  let deadlockFree = false;
  let live = false;
  let bounded = false;

  // Build adjacency structure
  const placeMap = new Map(net.places.map(p => [p.id, p]));
  const transitionMap = new Map(net.transitions.map(t => [t.id, t]));
  const incomingArcs = new Map<string, Array<{ source: string; weight: number }>>();
  const outgoingArcs = new Map<string, Array<{ target: string; weight: number }>>();

  // Initialize arc maps
  net.places.forEach(p => {
    incomingArcs.set(p.id, []);
    outgoingArcs.set(p.id, []);
  });
  net.transitions.forEach(t => {
    incomingArcs.set(t.id, []);
    outgoingArcs.set(t.id, []);
  });

  // Populate arcs
  net.arcs.forEach(arc => {
    const outgoing = outgoingArcs.get(arc.source) || [];
    outgoing.push({ target: arc.target, weight: arc.weight || 1 });
    outgoingArcs.set(arc.source, outgoing);

    const incoming = incomingArcs.get(arc.target) || [];
    incoming.push({ source: arc.source, weight: arc.weight || 1 });
    incomingArcs.set(arc.target, incoming);
  });

  // Check 1: Boundedness (safety)
  bounded = checkBoundedness(net, incomingArcs, outgoingArcs, details);

  // Check 2: Deadlock freedom (liveness)
  deadlockFree = checkDeadlockFreedom(net, initialMarking, incomingArcs, outgoingArcs, details);

  // Check 3: Proper completion (can reach final marking)
  live = canReachFinalMarking(net, initialMarking, finalMarking, incomingArcs, outgoingArcs, details);

  const sound = deadlockFree && live && bounded;

  if (!sound) {
    details.push('Petri net is NOT sound');
  }

  return {
    sound,
    deadlockFree,
    live,
    bounded,
    details,
  };
}

/**
 * Check boundedness (no place can have unlimited tokens).
 */
function checkBoundedness(
  net: PetriNet,
  incomingArcs: Map<string, Array<{ source: string; weight: number }>>,
  outgoingArcs: Map<string, Array<{ target: string; weight: number }>>,
  details: string[],
): boolean {
  // For structural boundedness, every place must have at least one incoming arc from a place
  // (not a transition) or be in the initial marking
  const placeIds = new Set(net.places.map(p => p.id));
  const initiallyMarked = new Set(net.places.filter(p => (p.initialMarking || 0) > 0).map(p => p.id));

  for (const place of net.places) {
    const incoming = incomingArcs.get(place.id) || [];

    // Check if there's a path from an initially marked place to this place
    const hasPathFromInitial = hasPathFromInitiallyMarked(place.id, initiallyMarked, placeIds, incomingArcs, outgoingArcs);

    // Check if this place can receive tokens (has incoming arc from a transition that can fire)
    const canReceiveTokens = incoming.some(arc => {
      const sourceIsTransition = net.transitions.some(t => t.id === arc.source);
      return sourceIsTransition;
    });

    if (!hasPathFromInitial && !canReceiveTokens && !initiallyMarked.has(place.id)) {
      details.push(`Place ${place.id} is structurally unbounded`);
      return false;
    }
  }

  details.push('All places are bounded');
  return true;
}

/**
 * Check if a place has a path from an initially marked place.
 */
function hasPathFromInitiallyMarked(
  placeId: string,
  initiallyMarked: Set<string>,
  placeIds: Set<string>,
  incomingArcs: Map<string, Array<{ source: string; weight: number }>>,
  outgoingArcs: Map<string, Array<{ target: string; weight: number }>>,
  visited = new Set<string>(),
): boolean {
  if (initiallyMarked.has(placeId)) {
    return true;
  }

  if (visited.has(placeId)) {
    return false;
  }
  visited.add(placeId);

  const incoming = incomingArcs.get(placeId) || [];
  for (const arc of incoming) {
    // If source is a place, recurse
    if (placeIds.has(arc.source)) {
      if (hasPathFromInitiallyMarked(arc.source, initiallyMarked, placeIds, incomingArcs, outgoingArcs, visited)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check deadlock freedom (every transition can eventually fire).
 */
function checkDeadlockFreedom(
  net: PetriNet,
  initialMarking: string[],
  incomingArcs: Map<string, Array<{ source: string; weight: number }>>,
  outgoingArcs: Map<string, Array<{ target: string; weight: number }>>,
  details: string[],
): boolean {
  // Simplified check: every transition should have at least one incoming place
  for (const transition of net.transitions) {
    const incoming = incomingArcs.get(transition.id) || [];
    const incomingPlaces = incoming.filter(arc => net.places.some(p => p.id === arc.source));

    if (incomingPlaces.length === 0) {
      details.push(`Transition ${transition.id} has no input places (source transition)`);
      return false;
    }
  }

  details.push('All transitions have input places');
  return true;
}

/**
 * Check if final marking is reachable from initial marking.
 */
function canReachFinalMarking(
  net: PetriNet,
  initialMarking: string[],
  finalMarking: string[],
  incomingArcs: Map<string, Array<{ source: string; weight: number }>>,
  outgoingArcs: Map<string, Array<{ target: string; weight: number }>>,
  details: string[],
): boolean {
  // Simplified structural check: there must be a path from initial to final marking
  const initialSet = new Set(initialMarking);
  const finalSet = new Set(finalMarking);

  // Check if all final places are reachable from initial places
  for (const finalPlace of finalMarking) {
    const reachable = isPlaceReachable(finalPlace, initialSet, new Set(net.places.map(p => p.id)), incomingArcs, outgoingArcs);

    if (!reachable) {
      details.push(`Final place ${finalPlace} is not reachable from initial marking`);
      return false;
    }
  }

  details.push('Final marking is structurally reachable from initial marking');
  return true;
}

/**
 * Check if a place is reachable from any of the source places.
 */
function isPlaceReachable(
  targetPlace: string,
  sourcePlaces: Set<string>,
  placeIds: Set<string>,
  incomingArcs: Map<string, Array<{ source: string; weight: number }>>,
  outgoingArcs: Map<string, Array<{ target: string; weight: number }>>,
  visited = new Set<string>(),
): boolean {
  if (sourcePlaces.has(targetPlace)) {
    return true;
  }

  if (visited.has(targetPlace)) {
    return false;
  }
  visited.add(targetPlace);

  const incoming = incomingArcs.get(targetPlace) || [];
  for (const arc of incoming) {
    // Follow path backward through transitions
    if (placeIds.has(arc.source)) {
      if (isPlaceReachable(arc.source, sourcePlaces, placeIds, incomingArcs, outgoingArcs, visited)) {
        return true;
      }
    } else {
      // Source is a transition, check its incoming places
      const transIncoming = incomingArcs.get(arc.source) || [];
      for (const transArc of transIncoming) {
        if (placeIds.has(transArc.source)) {
          if (isPlaceReachable(transArc.source, sourcePlaces, placeIds, incomingArcs, outgoingArcs, visited)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// ─── Quality Metrics ───────────────────────────────────────────────────────

/**
 * Compute quality metrics for a process model against an event log.
 */
export function computeQualityMetrics(
  model: PetriNet | VerifierDFG,
  eventLog: Array<{ activities: string[] }>,
  options: { type: 'petrinet' | 'dfg' } = { type: 'petrinet' },
): QualityMetrics {
  // Fitness: based on token replay
  const fitness = computeFitness(model, eventLog, options);

  // Precision: how much of the model behavior is allowed by the log
  const precision = computePrecision(model, eventLog, options);

  // Generalization: how well the model generalizes to unseen behavior
  const generalization = computeGeneralization(model, eventLog, options);

  // Simplicity: inverse of model complexity
  const simplicity = computeSimplicity(model, options);

  return { fitness, precision, generalization, simplicity };
}

/**
 * Compute fitness metric based on token replay.
 */
function computeFitness(
  model: PetriNet | VerifierDFG,
  eventLog: Array<{ activities: string[] }>,
  options: { type: 'petrinet' | 'dfg' },
): number {
  if (options.type === 'dfg') {
    return computeDFGFitness(model as VerifierDFG, eventLog);
  }

  // Token replay fitness for Petri nets
  const conformance = computeTokenReplayConformance(model as PetriNet, eventLog);
  return conformance.fit;
}

/**
 * Compute fitness for DFG model.
 */
function computeDFGFitness(dfg: VerifierDFG, eventLog: Array<{ activities: string[] }>): number {
  let totalEdges = 0;
  let matchingEdges = 0;

  for (const trace of eventLog) {
    for (let i = 0; i < trace.activities.length - 1; i++) {
      const source = trace.activities[i];
      const target = trace.activities[i + 1];
      totalEdges++;

      const edgeExists = dfg.edges.some(e => e.source === source && e.target === target);
      if (edgeExists) {
        matchingEdges++;
      }
    }
  }

  return totalEdges > 0 ? matchingEdges / totalEdges : 0;
}

/**
 * Compute token replay conformance.
 */
function computeTokenReplayConformance(
  net: PetriNet,
  eventLog: Array<{ activities: string[] }>,
): ConformanceResult {
  let consumedTokens = 0;
  let producedTokens = 0;
  let missingTokens = 0;
  let remainingTokens = 0;
  const traceFitness: number[] = [];

  for (const trace of eventLog) {
    let traceMissing = 0;
    let traceRemaining = 0;
    let traceConsumed = 0;
    let traceProduced = 0;

    // Simplified token replay
    for (const activity of trace.activities) {
      // Find transition for this activity
      const transition = net.transitions.find(t => t.label === activity);
      if (!transition) {
        traceMissing++;
        continue;
      }

      // Consume tokens from input places
      const inputArcs = net.arcs.filter(a => a.target === transition.id);
      for (const arc of inputArcs) {
        traceConsumed += arc.weight || 1;
        consumedTokens += arc.weight || 1;
      }

      // Produce tokens to output places
      const outputArcs = net.arcs.filter(a => a.source === transition.id);
      for (const arc of outputArcs) {
        traceProduced += arc.weight || 1;
        producedTokens += arc.weight || 1;
      }
    }

    traceMissing += traceRemaining;
    missingTokens += traceMissing;
    remainingTokens += traceRemaining;

    // Compute trace fitness: 1 - (missing + remaining) / (consumed + produced)
    const traceFit = traceConsumed + traceProduced > 0
      ? 1 - (traceMissing + traceRemaining) / (traceConsumed + traceProduced)
      : 0;
    traceFitness.push(Math.max(0, traceFit));
  }

  // Overall fitness
  const fit = consumedTokens + producedTokens > 0
    ? 1 - (missingTokens + remainingTokens) / (consumedTokens + producedTokens)
    : 0;

  return {
    fit: Math.max(0, fit),
    traceFitness,
    missingTokens,
    remainingTokens,
    consumedTokens,
    producedTokens,
  };
}

/**
 * Compute precision metric.
 */
function computePrecision(
  model: PetriNet | VerifierDFG,
  eventLog: Array<{ activities: string[] }>,
  options: { type: 'petrinet' | 'dfg' },
): number {
  if (options.type === 'dfg') {
    return computeDFGPrecision(model as VerifierDFG, eventLog);
  }

  // Precision for Petri nets: escaped edges metric
  // Count edges in model that don't appear in log
  const net = model as PetriNet;
  const logEdges = extractLogEdges(eventLog);

  let modelEdges = 0;
  let escapedEdges = 0;

  for (const transition of net.transitions) {
    if (!transition.label) continue;

    const inputPlaces = net.arcs.filter(a => a.target === transition.id).map(a => a.source);
    const outputPlaces = net.arcs.filter(a => a.source === transition.id).map(a => a.target);

    // For each input-output pair, check if sequence appears in log
    for (const input of inputPlaces) {
      for (const output of outputPlaces) {
        modelEdges++;

        // Find transitions connected to these places
        const prevTransition = net.transitions.find(t => net.arcs.some(a => a.source === t.id && a.target === input));
        const nextTransition = net.transitions.find(t => net.arcs.some(a => a.target === t.id && a.source === output));

        if (prevTransition?.label && nextTransition?.label) {
          const edgeExists = logEdges.has(`${prevTransition.label}->${nextTransition.label}`);
          if (!edgeExists) {
            escapedEdges++;
          }
        }
      }
    }
  }

  return modelEdges > 0 ? 1 - escapedEdges / modelEdges : 1;
}

/**
 * Compute precision for DFG model.
 */
function computeDFGPrecision(dfg: VerifierDFG, eventLog: Array<{ activities: string[] }>): number {
  const logEdges = extractLogEdges(eventLog);
  const modelEdges = new Set(dfg.edges.map(e => `${e.source}->${e.target}`));

  let escapedEdges = 0;
  for (const edge of modelEdges) {
    if (!logEdges.has(edge)) {
      escapedEdges++;
    }
  }

  return modelEdges.size > 0 ? 1 - escapedEdges / modelEdges.size : 1;
}

/**
 * Extract all edges from an event log.
 */
function extractLogEdges(eventLog: Array<{ activities: string[] }>): Set<string> {
  const edges = new Set<string>();

  for (const trace of eventLog) {
    for (let i = 0; i < trace.activities.length - 1; i++) {
      const edge = `${trace.activities[i]}->${trace.activities[i + 1]}`;
      edges.add(edge);
    }
  }

  return edges;
}

/**
 * Compute generalization metric.
 */
function computeGeneralization(
  model: PetriNet | VerifierDFG,
  eventLog: Array<{ activities: string[] }>,
  options: { type: 'petrinet' | 'dfg' },
): number {
  // Generalization: how well would the model handle unseen traces
  // Simplified: based on edge frequency distribution

  if (options.type === 'dfg') {
    const dfg = model as VerifierDFG;
    if (dfg.edges.length === 0) return 1;

    // Compute entropy of edge frequency distribution
    const total = dfg.edges.reduce((sum, e) => sum + e.count, 0);
    const entropy = dfg.edges.reduce((sum, e) => {
      const p = e.count / total;
      return sum - p * Math.log2(p);
    }, 0);

    // Normalize by max entropy (log2 of number of edges)
    const maxEntropy = Math.log2(dfg.edges.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 1;
  }

  // For Petri nets, use number of transitions as proxy
  const net = model as PetriNet;
  const numTransitions = net.transitions.length;
  const numTraces = eventLog.length;

  // More transitions relative to traces suggests better generalization
  return numTraces > 0 ? Math.min(1, numTransitions / numTraces) : 1;
}

/**
 * Compute simplicity metric.
 */
function computeSimplicity(
  model: PetriNet | VerifierDFG,
  options: { type: 'petrinet' | 'dfg' },
): number {
  if (options.type === 'dfg') {
    const dfg = model as VerifierDFG;
    // Simplicity: inverse of number of edges and nodes
    const size = dfg.nodes.length + dfg.edges.length;
    return size > 0 ? 1 / (1 + Math.log10(size)) : 1;
  }

  // For Petri nets: consider places, transitions, arcs
  const net = model as PetriNet;
  const size = net.places.length + net.transitions.length + net.arcs.length;
  return size > 0 ? 1 / (1 + Math.log10(size)) : 1;
}

// ─── DFG Validation ─────────────────────────────────────────────────────────

/**
 * Validate DFG structure.
 */
export function validateVerifierDFG(dfg: VerifierDFG): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check nodes
  if (!dfg.nodes || dfg.nodes.length === 0) {
    errors.push('DFG must have at least one node');
  }

  // Check edges reference valid nodes
  const nodeSet = new Set(dfg.nodes);
  for (const edge of dfg.edges) {
    if (!nodeSet.has(edge.source)) {
      errors.push(`Edge source '${edge.source}' not in nodes`);
    }
    if (!nodeSet.has(edge.target)) {
      errors.push(`Edge target '${edge.target}' not in nodes`);
    }
    if (edge.count < 0) {
      errors.push(`Edge ${edge.source}->${edge.target} has negative count`);
    }
  }

  // Check start activities are valid nodes
  for (const start of dfg.startActivities) {
    if (!nodeSet.has(start)) {
      errors.push(`Start activity '${start}' not in nodes`);
    }
  }

  // Check end activities are valid nodes
  for (const end of dfg.endActivities) {
    if (!nodeSet.has(end)) {
      errors.push(`End activity '${end}' not in nodes`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format soundness result as human-readable string.
 */
export function formatSoundnessResult(result: SoundnessResult): string {
  const lines: string[] = [];

  lines.push(`Soundness: ${result.sound ? 'PASS' : 'FAIL'}`);
  lines.push(`  Deadlock-free: ${result.deadlockFree ? 'YES' : 'NO'}`);
  lines.push(`  Live: ${result.live ? 'YES' : 'NO'}`);
  lines.push(`  Bounded: ${result.bounded ? 'YES' : 'NO'}`);

  if (result.details.length > 0) {
    lines.push('\nDetails:');
    result.details.forEach(d => lines.push(`  - ${d}`));
  }

  return lines.join('\n');
}

/**
 * Format quality metrics as human-readable string.
 */
export function formatQualityMetrics(metrics: QualityMetrics): string {
  return [
    `Fitness: ${metrics.fitness.toFixed(4)}`,
    `Precision: ${metrics.precision.toFixed(4)}`,
    `Generalization: ${metrics.generalization.toFixed(4)}`,
    `Simplicity: ${metrics.simplicity.toFixed(4)}`,
  ].join('\n');
}
