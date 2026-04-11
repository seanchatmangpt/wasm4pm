//! Process model complexity metrics.
//!
//! Five complementary metrics that practitioners use for governance,
//! model comparison, and cognitive load estimation:
//!
//! | Metric             | What it measures                      |
//! |--------------------|---------------------------------------|
//! | `cyclomatic`       | Decision paths (McCabe analog)        |
//! | `cfc`              | Control-flow complexity (Cardoso)     |
//! | `cognitive`        | Nesting-weighted structural load      |
//! | `halstead`         | Information-theoretic volume/effort   |
//! | `nesting_depth`    | Maximum nesting depth                 |
//! | `branching_factor` | Average children per operator node    |

use crate::powl_arena::{PowlArena, PowlNode};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// ─── Output types ─────────────────────────────────────────────────────────────

/// Halstead software science metrics adapted for process models.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HalsteadMetrics {
    /// Unique operator types (XOR, LOOP, SPO, DG, ...).
    pub n1: usize,
    /// Unique operand tokens (distinct activity labels + tau).
    pub n2: usize,
    /// Total operator occurrences.
    pub capital_n1: usize,
    /// Total operand occurrences.
    pub capital_n2: usize,
    /// Vocabulary: n1 + n2.
    pub vocabulary: usize,
    /// Length: N1 + N2.
    pub length: usize,
    /// Volume: length * log2(vocabulary).
    pub volume: f64,
    /// Difficulty: (n1/2) * (N2/n2).
    pub difficulty: f64,
    /// Effort: difficulty * volume.
    pub effort: f64,
}

/// All complexity metrics for a POWL model.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComplexityReport {
    /// McCabe cyclomatic complexity analog.
    /// Base = 1; each XOR adds (branches - 1); each LOOP adds 1.
    pub cyclomatic: usize,
    /// Cardoso Control-Flow Complexity.
    /// XOR(n) -> sum of children's CFC; LOOP -> 2*CFC(do); AND/SPO -> max; leaf -> 1.
    pub cfc: usize,
    /// Cognitive complexity (nesting-weighted).
    /// Each structural node adds its nesting depth to the score.
    pub cognitive: usize,
    /// Maximum nesting depth (0 = flat leaf).
    pub nesting_depth: usize,
    /// Average number of children across all operator/SPO/DG nodes.
    pub branching_factor: f64,
    /// Total number of distinct activity labels.
    pub activity_count: usize,
    /// Total node count in the arena.
    pub node_count: usize,
    /// Halstead metrics.
    pub halstead: HalsteadMetrics,
}

// ─── Computation ──────────────────────────────────────────────────────────────

struct Collector {
    cyclomatic: usize,
    cognitive: usize,
    max_depth: usize,
    operator_types: HashSet<String>,
    operator_total: usize,
    activity_set: HashSet<String>,
    activity_total: usize,
    operator_children_counts: Vec<usize>,
}

impl Collector {
    fn new() -> Self {
        Self {
            cyclomatic: 1,
            cognitive: 0,
            max_depth: 0,
            operator_types: HashSet::new(),
            operator_total: 0,
            activity_set: HashSet::new(),
            activity_total: 0,
            operator_children_counts: Vec::new(),
        }
    }
}

/// Recursively compute CFC (returned) and side-effect all other metrics.
fn visit(arena: &PowlArena, idx: u32, depth: usize, col: &mut Collector) -> usize {
    if depth > col.max_depth {
        col.max_depth = depth;
    }

    match arena.get(idx) {
        None => 1,

        Some(PowlNode::Transition(t)) => {
            let label = t.label.clone().unwrap_or_else(|| "tau".to_string());
            col.activity_set.insert(label);
            col.activity_total += 1;
            1 // CFC of a leaf
        }

        Some(PowlNode::FrequentTransition(ft)) => {
            col.activity_set.insert(ft.activity.clone());
            col.activity_total += 1;
            // FrequentTransition is implicitly optional -- contributes 1 choice
            col.cyclomatic += 1;
            col.cognitive += depth + 1;
            2 // leaf + optional path
        }

        Some(PowlNode::OperatorPowl(op)) => {
            let operator = op.operator.as_str().to_string();
            let children = op.children.clone();
            let n = children.len();

            col.operator_types.insert(operator.clone());
            col.operator_total += 1;
            col.operator_children_counts.push(n);

            match operator.as_str() {
                "X" => {
                    // cyclomatic: each extra branch
                    col.cyclomatic += n.saturating_sub(1);
                    col.cognitive += depth + 1;
                    // CFC(XOR) = sum of children CFCs
                    let child_cfcs: Vec<usize> = children
                        .iter()
                        .map(|&c| visit(arena, c, depth + 1, col))
                        .collect();
                    child_cfcs.iter().sum()
                }
                "*" => {
                    col.cyclomatic += 1; // redo path
                    col.cognitive += depth + 1;
                    // children[0] = do, children[1] = redo
                    let do_cfc = if !children.is_empty() {
                        visit(arena, children[0], depth + 1, col)
                    } else {
                        1
                    };
                    if children.len() > 1 {
                        visit(arena, children[1], depth + 1, col);
                    }
                    2 * do_cfc // CFC(LOOP) = 2 * CFC(do)
                }
                _ => {
                    // Any other operator (PartialOrder inline, Sequence, etc.)
                    col.cognitive += depth + 1;
                    let child_cfcs: Vec<usize> = children
                        .iter()
                        .map(|&c| visit(arena, c, depth + 1, col))
                        .collect();
                    child_cfcs.iter().copied().max().unwrap_or(1)
                }
            }
        }

        Some(PowlNode::StrictPartialOrder(spo)) => {
            let children = spo.children.clone();
            let n = children.len();

            col.operator_types.insert("SPO".to_string());
            col.operator_total += 1;
            col.operator_children_counts.push(n);
            col.cognitive += depth + 1;

            // CFC(AND/SPO) = max of children CFCs
            let child_cfcs: Vec<usize> = children
                .iter()
                .map(|&c| visit(arena, c, depth + 1, col))
                .collect();
            child_cfcs.iter().copied().max().unwrap_or(1)
        }

        Some(PowlNode::DecisionGraph(dg)) => {
            // Treat as StrictPartialOrder for complexity measurement
            let children = dg.children.clone();
            let n = children.len();

            col.operator_types.insert("DG".to_string());
            col.operator_total += 1;
            col.operator_children_counts.push(n);
            col.cognitive += depth + 1;

            // CFC(AND/SPO/DG) = max of children CFCs
            let child_cfcs: Vec<usize> = children
                .iter()
                .map(|&c| visit(arena, c, depth + 1, col))
                .collect();
            child_cfcs.iter().copied().max().unwrap_or(1)
        }
    }
}

/// Compute all complexity metrics for a POWL model rooted at `root`.
pub fn measure(arena: &PowlArena, root: u32) -> ComplexityReport {
    let mut col = Collector::new();
    let cfc = visit(arena, root, 0, &mut col);

    let n1 = col.operator_types.len();
    let n2 = col.activity_set.len();
    let cap_n1 = col.operator_total;
    let cap_n2 = col.activity_total;
    let vocab = n1 + n2;
    let length = cap_n1 + cap_n2;
    let volume = if vocab > 1 {
        length as f64 * (vocab as f64).log2()
    } else {
        0.0
    };
    let difficulty = if n2 > 0 {
        (n1 as f64 / 2.0) * (cap_n2 as f64 / n2 as f64)
    } else {
        0.0
    };

    let branching_factor = if col.operator_children_counts.is_empty() {
        0.0
    } else {
        col.operator_children_counts.iter().sum::<usize>() as f64
            / col.operator_children_counts.len() as f64
    };

    ComplexityReport {
        cyclomatic: col.cyclomatic,
        cfc,
        cognitive: col.cognitive,
        nesting_depth: col.max_depth,
        branching_factor,
        activity_count: col.activity_set.len(),
        node_count: arena.len(),
        halstead: HalsteadMetrics {
            n1,
            n2,
            capital_n1: cap_n1,
            capital_n2: cap_n2,
            vocabulary: vocab,
            length,
            volume,
            difficulty,
            effort: difficulty * volume,
        },
    }
}

/// Compute simplicity metric for a Petri net.
///
/// Simplicity measures how "simple" a model is based on its structure.
/// The arc_degree variant uses: 1 - (arcs / (places * transitions))
/// where a value closer to 1.0 indicates a simpler model.
///
/// This mirrors `pm4py.analysis.simplicity_petri_net()` with variant="arc_degree".
///
/// # Arguments
/// * `num_places` - Number of places in the Petri net
/// * `num_transitions` - Number of transitions in the Petri net
/// * `num_arcs` - Number of arcs in the Petri net
///
/// # Returns
/// Simplicity score in [0.0, 1.0] where 1.0 is simplest.
pub fn simplicity_arc_degree(num_places: usize, num_transitions: usize, num_arcs: usize) -> f64 {
    // Maximum possible arcs in a bipartite graph: places * transitions
    let max_arcs = num_places * num_transitions;
    if max_arcs == 0 {
        return 1.0;
    }
    // Normalized simplicity: 1 - (actual_arcs / max_possible_arcs)
    1.0 - (num_arcs as f64 / max_arcs as f64)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn parse(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn leaf_has_base_complexity() {
        let (arena, root) = parse("A");
        let r = measure(&arena, root);
        assert_eq!(r.cyclomatic, 1);
        assert_eq!(r.cfc, 1);
        assert_eq!(r.nesting_depth, 0);
        assert_eq!(r.activity_count, 1);
    }

    #[test]
    fn xor_adds_branches() {
        let (arena, root) = parse("X(A, B, C)");
        let r = measure(&arena, root);
        assert_eq!(r.cyclomatic, 3); // 1 base + 2 extra branches
        assert_eq!(r.cfc, 3); // sum of 3 leaf CFCs
        assert_eq!(r.branching_factor, 3.0);
    }

    #[test]
    fn loop_adds_one() {
        let (arena, root) = parse("*(A, B)");
        let r = measure(&arena, root);
        assert_eq!(r.cyclomatic, 2); // 1 base + 1 redo
        assert_eq!(r.cfc, 2); // 2 * CFC(A)
    }

    #[test]
    fn spo_uses_max_cfc() {
        let (arena, root) = parse("PO=(nodes={A, B, C}, order={A-->B, A-->C})");
        let r = measure(&arena, root);
        assert_eq!(r.cfc, 1); // max(1,1,1)
        assert_eq!(r.activity_count, 3);
    }

    #[test]
    fn nested_increases_depth() {
        let (arena, root) = parse("X(A, X(B, C))");
        let r = measure(&arena, root);
        assert!(r.nesting_depth >= 2);
        assert!(r.cognitive >= 2);
    }

    #[test]
    fn halstead_volume_positive_for_complex_model() {
        let (arena, root) = parse("X(A, *(B, C))");
        let r = measure(&arena, root);
        assert!(r.halstead.volume > 0.0);
        assert!(r.halstead.effort > 0.0);
    }

    #[test]
    fn decision_graph_complexity() {
        let (arena, root) =
            parse("DG=(nodes={A, B}, order={A-->B}, starts=[A], ends=[B], empty=false)");
        let r = measure(&arena, root);
        // DG treated like SPO: CFC = max(1,1) = 1
        assert_eq!(r.cfc, 1);
        assert_eq!(r.activity_count, 2);
    }

    #[test]
    fn simplicity_perfect_bipartite() {
        // 2 places, 2 transitions, 4 arcs = fully connected
        let s = simplicity_arc_degree(2, 2, 4);
        assert!((s - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn simplicity_no_arcs() {
        let s = simplicity_arc_degree(2, 2, 0);
        assert!((s - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn simplicity_empty_net() {
        let s = simplicity_arc_degree(0, 0, 0);
        assert!((s - 1.0).abs() < f64::EPSILON);
    }
}
