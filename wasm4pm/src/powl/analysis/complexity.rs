//! Process model complexity metrics.

use crate::powl_arena::{PowlArena, PowlNode};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HalsteadMetrics {
    pub n1: usize,
    pub n2: usize,
    pub capital_n1: usize,
    pub capital_n2: usize,
    pub vocabulary: usize,
    pub length: usize,
    pub volume: f64,
    pub difficulty: f64,
    pub effort: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComplexityReport {
    pub cyclomatic: usize,
    pub cfc: usize,
    pub cognitive: usize,
    pub nesting_depth: usize,
    pub branching_factor: f64,
    pub activity_count: usize,
    pub node_count: usize,
    pub halstead: HalsteadMetrics,
}

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
            1
        }

        Some(PowlNode::FrequentTransition(ft)) => {
            col.activity_set.insert(ft.activity.clone());
            col.activity_total += 1;
            col.cyclomatic += 1;
            col.cognitive += depth + 1;
            2
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
                    col.cyclomatic += n.saturating_sub(1);
                    col.cognitive += depth + 1;
                    let child_cfcs: Vec<usize> = children
                        .iter()
                        .map(|&c| visit(arena, c, depth + 1, col))
                        .collect();
                    child_cfcs.iter().sum()
                }
                "*" => {
                    col.cyclomatic += 1;
                    col.cognitive += depth + 1;
                    let do_cfc = if !children.is_empty() {
                        visit(arena, children[0], depth + 1, col)
                    } else {
                        1
                    };
                    if children.len() > 1 {
                        visit(arena, children[1], depth + 1, col);
                    }
                    2 * do_cfc
                }
                _ => {
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

            let child_cfcs: Vec<usize> = children
                .iter()
                .map(|&c| visit(arena, c, depth + 1, col))
                .collect();
            child_cfcs.iter().copied().max().unwrap_or(1)
        }
    }
}

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
    }

    #[test]
    fn xor_adds_branches() {
        let (arena, root) = parse("X(A, B, C)");
        let r = measure(&arena, root);
        assert_eq!(r.cyclomatic, 3);
        assert_eq!(r.cfc, 3);
        assert_eq!(r.branching_factor, 3.0);
    }

    #[test]
    fn loop_adds_one() {
        let (arena, root) = parse("*(A, B)");
        let r = measure(&arena, root);
        assert_eq!(r.cyclomatic, 2);
        assert_eq!(r.cfc, 2);
    }

    #[test]
    fn spo_uses_max_cfc() {
        let (arena, root) = parse("PO=(nodes={A, B, C}, order={A-->B, A-->C})");
        let r = measure(&arena, root);
        assert_eq!(r.cfc, 1);
        assert_eq!(r.activity_count, 3);
    }
}
