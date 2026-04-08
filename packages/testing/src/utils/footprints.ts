/**
 * Footprint Utilities
 *
 * Footprints (behavioral profiles) capture ordering relationships between activities.
 * Used for process model comparison and conformance checking.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface FootprintMatrix {
  activities: string[];
  matrix: Map<string, Map<string, FootprintRelation>>;
}

export type FootprintRelation =
  | 'sequence'     // A -> B (A precedes B)
  | 'parallel'     // A || B (A and B are parallel)
  | 'choice'       // A # B (A and B are in exclusive choice)
  | 'no_relation'; // A and B are unrelated

export interface FootprintComparison {
  equivalent: boolean;
  relationMatches: number;
  relationMismatches: number;
  missingInFirst: Array<{ a: string; b: string; relation: FootprintRelation }>;
  missingInSecond: Array<{ a: string; b: string; relation: FootprintRelation }>;
}

// ─── Footprint Extraction ───────────────────────────────────────────────────

/**
 * Extract footprints from an event log.
 *
 * The footprint matrix captures the ordering relationships between activities.
 */
export function extractFootprintsFromLog(eventLog: Array<{ activities: string[] }>): FootprintMatrix {
  const activities = extractActivities(eventLog);
  const matrix = new Map<string, Map<string, FootprintRelation>>();

  // Initialize matrix with no_relation
  for (const a of activities) {
    matrix.set(a, new Map());
    for (const b of activities) {
      matrix.get(a)!.set(b, 'no_relation');
    }
  }

  // Analyze traces to determine relations
  const precedenceCounts = new Map<string, number>();
  const successionCounts = new Map<string, number>();
  const coOccurrenceCounts = new Map<string, number>();

  for (const trace of eventLog) {
    const { activities } = trace;

    // Count precedence and succession
    for (let i = 0; i < activities.length; i++) {
      for (let j = i + 1; j < activities.length; j++) {
        const a = activities[i];
        const b = activities[j];

        if (i + 1 === j) {
          // Direct succession
          const key = `${a}->${b}`;
          successionCounts.set(key, (successionCounts.get(key) || 0) + 1);
        }

        // Precedence (a comes before b somewhere in trace)
        const precKey = `${a}>>${b}`;
        precedenceCounts.set(precKey, (precedenceCounts.get(precKey) || 0) + 1);
      }
    }

    // Count co-occurrences (activities in same trace)
    for (let i = 0; i < activities.length; i++) {
      for (let j = i + 1; j < activities.length; j++) {
        const a = activities[i];
        const b = activities[j];
        const key = `${a}<>${b}`;
        coOccurrenceCounts.set(key, (coOccurrenceCounts.get(key) || 0) + 1);
      }
    }
  }

  // Determine relations based on counts
  for (const a of activities) {
    for (const b of activities) {
      if (a === b) {
        matrix.get(a)!.set(b, 'no_relation');
        continue;
      }

      const aBeforeB = precedenceCounts.get(`${a}>>${b}`) || 0;
      const bBeforeA = precedenceCounts.get(`${b}>>${a}`) || 0;
      const aToB = successionCounts.get(`${a}->${b}`) || 0;
      const bToA = successionCounts.get(`${b}->${a}`) || 0;
      const coOccur = coOccurrenceCounts.get(`${a}<>${b}`) || 0;

      let relation: FootprintRelation;

      if (aToB > 0 && bToA > 0) {
        // Both directions exist: parallel
        relation = 'parallel';
      } else if (aToB > 0) {
        // Only A -> B exists: sequence
        relation = 'sequence';
      } else if (bToA > 0) {
        // Only B -> A exists: sequence
        relation = 'sequence';
      } else if (aBeforeB > 0 && bBeforeA > 0) {
        // Both precede each other (in different traces): parallel
        relation = 'parallel';
      } else if (aBeforeB > 0 || bBeforeA > 0) {
        // One precedes the other: sequence
        relation = 'sequence';
      } else if (coOccur > 0) {
        // Co-occur but no clear order: parallel
        relation = 'parallel';
      } else {
        // Never occur together: choice
        relation = 'choice';
      }

      matrix.get(a)!.set(b, relation);
    }
  }

  return { activities, matrix };
}

/**
 * Extract footprints from a DFG.
 *
 * DFG provides sequence relations directly.
 */
export function extractFootprintsFromDFG(dfg: {
  nodes: string[];
  edges: Array<{ source: string; target: string }>;
}): FootprintMatrix {
  const activities = dfg.nodes;
  const matrix = new Map<string, Map<string, FootprintRelation>>();

  // Initialize matrix
  for (const a of activities) {
    matrix.set(a, new Map());
    for (const b of activities) {
      matrix.get(a)!.set(b, 'no_relation');
    }
  }

  // Set sequence relations from DFG edges
  for (const edge of dfg.edges) {
    const { source, target } = edge;

    if (matrix.has(source) && matrix.get(source)!.has(target)) {
      // Check if reverse edge exists
      const reverseExists = dfg.edges.some(e => e.source === target && e.target === source);

      if (reverseExists) {
        matrix.get(source)!.set(target, 'parallel');
        matrix.get(target)!.set(source, 'parallel');
      } else {
        matrix.get(source)!.set(target, 'sequence');
        // Reverse direction is 'no_relation' unless we find evidence otherwise
      }
    }
  }

  // Activities not connected are in choice relation
  for (const a of activities) {
    for (const b of activities) {
      if (a === b) continue;

      const currentRelation = matrix.get(a)!.get(b);
      if (currentRelation === 'no_relation') {
        // Check if they ever co-occur in any path
        const canReach = canReachInDFG(dfg, a, b);
        const canReachReverse = canReachInDFG(dfg, b, a);

        if (canReach && canReachReverse) {
          matrix.get(a)!.set(b, 'parallel');
        } else if (canReach || canReachReverse) {
          matrix.get(a)!.set(b, 'sequence');
        } else {
          matrix.get(a)!.set(b, 'choice');
        }
      }
    }
  }

  return { activities, matrix };
}

/**
 * Check if target can be reached from source in DFG.
 */
function canReachInDFG(
  dfg: { nodes: string[]; edges: Array<{ source: string; target: string }> },
  source: string,
  target: string,
): boolean {
  const visited = new Set<string>();

  function dfs(node: string): boolean {
    if (node === target) return true;
    if (visited.has(node)) return false;
    visited.add(node);

    const outgoing = dfg.edges.filter(e => e.source === node);
    for (const edge of outgoing) {
      if (dfs(edge.target)) {
        return true;
      }
    }

    return false;
  }

  return dfs(source);
}

/**
 * Extract unique activities from event log.
 */
function extractActivities(eventLog: Array<{ activities: string[] }>): string[] {
  const activities = new Set<string>();

  for (const trace of eventLog) {
    for (const activity of trace.activities) {
      activities.add(activity);
    }
  }

  return Array.from(activities).sort();
}

// ─── Footprint Comparison ─────────────────────────────────────────────────

/**
 * Compare two footprint matrices.
 */
export function compareFootprints(fp1: FootprintMatrix, fp2: FootprintMatrix): FootprintComparison {
  const activities1 = new Set(fp1.activities);
  const activities2 = new Set(fp2.activities);

  const relationMatches: number[] = [];
  const relationMismatches: number[] = [];
  const missingInFirst: Array<{ a: string; b: string; relation: FootprintRelation }> = [];
  const missingInSecond: Array<{ a: string; b: string; relation: FootprintRelation }> = [];

  // Compare relations for all activity pairs
  const allActivities = new Set([...fp1.activities, ...fp2.activities]);

  for (const a of allActivities) {
    for (const b of allActivities) {
      if (a === b) continue;

      const rel1 = fp1.matrix.get(a)?.get(b);
      const rel2 = fp2.matrix.get(a)?.get(b);

      if (rel1 === undefined && rel2 !== undefined) {
        missingInFirst.push({ a, b, relation: rel2 });
        relationMismatches.push(1);
      } else if (rel1 !== undefined && rel2 === undefined) {
        missingInSecond.push({ a, b, relation: rel1 });
        relationMismatches.push(1);
      } else if (rel1 === undefined && rel2 === undefined) {
        // Both undefined - neither has this relation
        continue;
      } else if (rel1 === rel2) {
        relationMatches.push(1);
      } else {
        relationMismatches.push(1);
      }
    }
  }

  const totalRelations = relationMatches.length + relationMismatches.length;
  const equivalent = totalRelations > 0 && relationMismatches.length === 0;

  return {
    equivalent,
    relationMatches: relationMatches.length,
    relationMismatches: relationMismatches.length,
    missingInFirst,
    missingInSecond,
  };
}

/**
 * Check if two footprint matrices are equivalent.
 */
export function areFootprintsEquivalent(fp1: FootprintMatrix, fp2: FootprintMatrix): boolean {
  const comparison = compareFootprints(fp1, fp2);
  return comparison.equivalent;
}

// ─── Footprint Visualization ────────────────────────────────────────────────

/**
 * Format footprint matrix as human-readable string.
 */
export function formatFootprints(fp: FootprintMatrix): string {
  const lines: string[] = [];

  lines.push('Footprint Matrix:');
  lines.push(`Activities: [${fp.activities.join(', ')}]`);
  lines.push('');
  lines.push('Relations:');

  // Header row
  let header = '      ';
  for (const b of fp.activities) {
    header += `${b.padEnd(10)}`;
  }
  lines.push(header);

  // Data rows
  for (const a of fp.activities) {
    let row = `${a.padEnd(6)}`;
    for (const b of fp.activities) {
      const relation = fp.matrix.get(a)?.get(b);
      const symbol = relationToSymbol(relation);
      row += `${symbol.padEnd(10)}`;
    }
    lines.push(row);
  }

  return lines.join('\n');
}

/**
 * Convert footprint relation to display symbol.
 */
function relationToSymbol(relation: FootprintRelation | undefined): string {
  switch (relation) {
    case 'sequence':
      return '->';
    case 'parallel':
      return '||';
    case 'choice':
      return '#';
    case 'no_relation':
      return '.';
    default:
      return '?';
  }
}

/**
 * Format footprint comparison as human-readable string.
 */
export function formatFootprintComparison(comparison: FootprintComparison): string {
  const lines: string[] = [];

  lines.push(`Footprint Comparison: ${comparison.equivalent ? 'EQUIVALENT' : 'DIFFERENT'}`);
  lines.push(`  Relation Matches: ${comparison.relationMatches}`);
  lines.push(`  Relation Mismatches: ${comparison.relationMismatches}`);

  if (comparison.missingInSecond.length > 0) {
    lines.push('');
    lines.push('  Relations only in first:');
    for (const { a, b, relation } of comparison.missingInSecond) {
      lines.push(`    ${a} ${relationToSymbol(relation)} ${b}`);
    }
  }

  if (comparison.missingInFirst.length > 0) {
    lines.push('');
    lines.push('  Relations only in second:');
    for (const { a, b, relation } of comparison.missingInFirst) {
      lines.push(`    ${a} ${relationToSymbol(relation)} ${b}`);
    }
  }

  return lines.join('\n');
}

// ─── Test Helpers ─────────────────────────────────────────────────────────

/**
 * Create test footprint matrix for sequential process A -> B -> C.
 */
export function createSequentialFootprint(): FootprintMatrix {
  const activities = ['A', 'B', 'C'];
  const matrix = new Map<string, Map<string, FootprintRelation>>();

  for (const a of activities) {
    matrix.set(a, new Map());
    for (const b of activities) {
      matrix.get(a)!.set(b, 'no_relation');
    }
  }

  // A -> B -> C
  matrix.get('A')!.set('B', 'sequence');
  matrix.get('A')!.set('C', 'sequence');
  matrix.get('B')!.set('C', 'sequence');

  // Reverse is choice (never occurs)
  matrix.get('B')!.set('A', 'choice');
  matrix.get('C')!.set('A', 'choice');
  matrix.get('C')!.set('B', 'choice');

  return { activities, matrix };
}

/**
 * Create test footprint matrix for parallel process A -> (B || C) -> D.
 */
export function createParallelFootprint(): FootprintMatrix {
  const activities = ['A', 'B', 'C', 'D'];
  const matrix = new Map<string, Map<string, FootprintRelation>>();

  for (const a of activities) {
    matrix.set(a, new Map());
    for (const b of activities) {
      matrix.get(a)!.set(b, 'no_relation');
    }
  }

  // A -> B, A -> C, B -> D, C -> D
  matrix.get('A')!.set('B', 'sequence');
  matrix.get('A')!.set('C', 'sequence');
  matrix.get('A')!.set('D', 'sequence');
  matrix.get('B')!.set('D', 'sequence');
  matrix.get('C')!.set('D', 'sequence');

  // B || C (parallel)
  matrix.get('B')!.set('C', 'parallel');
  matrix.get('C')!.set('B', 'parallel');

  // Reverse relations
  matrix.get('B')!.set('A', 'choice');
  matrix.get('C')!.set('A', 'choice');
  matrix.get('D')!.set('A', 'choice');
  matrix.get('D')!.set('B', 'choice');
  matrix.get('D')!.set('C', 'choice');

  return { activities, matrix };
}

/**
 * Create test footprint matrix for exclusive choice A -> (B # C) -> D.
 */
export function createChoiceFootprint(): FootprintMatrix {
  const activities = ['A', 'B', 'C', 'D'];
  const matrix = new Map<string, Map<string, FootprintRelation>>();

  for (const a of activities) {
    matrix.set(a, new Map());
    for (const b of activities) {
      matrix.get(a)!.set(b, 'no_relation');
    }
  }

  // A -> B, A -> C, B -> D, C -> D
  matrix.get('A')!.set('B', 'sequence');
  matrix.get('A')!.set('C', 'sequence');
  matrix.get('A')!.set('D', 'sequence');
  matrix.get('B')!.set('D', 'sequence');
  matrix.get('C')!.set('D', 'sequence');

  // B # C (choice)
  matrix.get('B')!.set('C', 'choice');
  matrix.get('C')!.set('B', 'choice');

  // Reverse relations
  matrix.get('B')!.set('A', 'choice');
  matrix.get('C')!.set('A', 'choice');
  matrix.get('D')!.set('A', 'choice');
  matrix.get('D')!.set('B', 'choice');
  matrix.get('D')!.set('C', 'choice');

  return { activities, matrix };
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Serialize footprint matrix to JSON string.
 */
export function serializeFootprints(fp: FootprintMatrix): string {
  const obj: {
    activities: string[];
    matrix: Array<{ a: string; b: string; relation: FootprintRelation }>;
  } = {
    activities: fp.activities,
    matrix: [],
  };

  for (const a of fp.activities) {
    for (const b of fp.activities) {
      const relation = fp.matrix.get(a)?.get(b);
      if (relation && relation !== 'no_relation') {
        obj.matrix.push({ a, b, relation });
      }
    }
  }

  return JSON.stringify(obj, null, 2);
}

/**
 * Deserialize footprint matrix from JSON string.
 */
export function deserializeFootprints(json: string): FootprintMatrix {
  const obj = JSON.parse(json);
  const matrix = new Map<string, Map<string, FootprintRelation>>();

  // Initialize matrix
  for (const a of obj.activities) {
    matrix.set(a, new Map());
    for (const b of obj.activities) {
      matrix.get(a)!.set(b, 'no_relation');
    }
  }

  // Populate relations
  for (const { a, b, relation } of obj.matrix) {
    matrix.get(a)!.set(b, relation);
  }

  return { activities: obj.activities, matrix };
}

/**
 * Compute footprint entropy (measure of process complexity).
 */
export function computeFootprintEntropy(fp: FootprintMatrix): number {
  const relationCounts = new Map<FootprintRelation, number>();

  for (const a of fp.activities) {
    for (const b of fp.activities) {
      if (a === b) continue;
      const relation = fp.matrix.get(a)?.get(b);
      if (relation && relation !== 'no_relation') {
        relationCounts.set(relation, (relationCounts.get(relation) || 0) + 1);
      }
    }
  }

  const total = Array.from(relationCounts.values()).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const count of relationCounts.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}
