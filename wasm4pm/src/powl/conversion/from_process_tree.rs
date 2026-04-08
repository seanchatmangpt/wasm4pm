//! Convert a Process Tree (JSON) to a POWL model.
//!
//! Mirrors `powl/conversion/to_powl/from_tree.py` from the Python POWL package.
//!
//! Mapping:
//!   Leaf with label   → Transition(label)
//!   Leaf without label → SilentTransition
//!   XOR               → OperatorPowl(Xor, children)
//!   LOOP              → OperatorPowl(Loop, children)
//!   PARALLEL          → StrictPartialOrder(children, no edges)
//!   SEQUENCE          → StrictPartialOrder(children, total order edges)
//!
//! After conversion, `simplify()` is called to normalize the model.

use crate::powl::simplify;
use crate::powl_arena::{Operator, PowlArena};
use crate::powl_process_tree::ProcessTree;

/// Convert a ProcessTree (parsed from JSON) into a POWL arena + root index.
pub fn apply(tree: &ProcessTree) -> (PowlArena, u32) {
    let mut arena = PowlArena::new();
    let root = convert_node(&mut arena, tree);
    let simplified = simplify::simplify(&mut arena, root);
    (arena, simplified)
}

/// Recursively convert a ProcessTree node into a POWL arena node.
fn convert_node(arena: &mut PowlArena, tree: &ProcessTree) -> u32 {
    match &tree.operator {
        None => {
            // Leaf node
            if let Some(label) = &tree.label {
                arena.add_transition(Some(label.clone()))
            } else {
                arena.add_silent_transition()
            }
        }
        Some(op) => {
            let children: Vec<u32> = tree
                .children
                .iter()
                .map(|c| convert_node(arena, c))
                .collect();

            match op {
                crate::powl_process_tree::PtOperator::Xor => {
                    if children.len() < 2 {
                        // Single child XOR is just the child itself
                        children
                            .into_iter()
                            .next()
                            .unwrap_or(arena.add_silent_transition())
                    } else {
                        arena.add_operator(Operator::Xor, children)
                    }
                }
                crate::powl_process_tree::PtOperator::Loop => {
                    // Ensure exactly 2 children (do, redo)
                    let mut kids = children;
                    while kids.len() < 2 {
                        kids.push(arena.add_silent_transition());
                    }
                    arena.add_operator(Operator::Loop, kids)
                }
                crate::powl_process_tree::PtOperator::Parallel => {
                    // Parallel = StrictPartialOrder with no order edges
                    arena.add_strict_partial_order(children)
                }
                crate::powl_process_tree::PtOperator::Sequence => {
                    // Sequence = StrictPartialOrder with total order edges
                    let spo_idx = arena.add_strict_partial_order(children.clone());
                    // Add edges between every consecutive pair: A→B, A→C, B→C, etc.
                    for i in 0..children.len() {
                        for j in (i + 1)..children.len() {
                            arena.add_order_edge(spo_idx, i, j);
                        }
                    }
                    spo_idx
                }
            }
        }
    }
}

/// Parse a process tree JSON string and convert to POWL.
///
/// Input JSON format (same as `powl_to_process_tree` output):
/// ```json
/// {"operator": "Xor", "children": [{"label": "A"}, {"label": "B"}]}
/// ```
pub fn process_tree_to_powl(tree_json: &str) -> Result<(PowlArena, u32), String> {
    let tree: ProcessTree =
        serde_json::from_str(tree_json).map_err(|e| format!("invalid process tree JSON: {}", e))?;
    Ok(apply(&tree))
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaf_activity() {
        let tree = ProcessTree::leaf(Some("A".to_string()));
        let (arena, root) = apply(&tree);
        assert_eq!(arena.to_repr(root), "A");
    }

    #[test]
    fn leaf_silent() {
        let tree = ProcessTree::leaf(None);
        let (arena, root) = apply(&tree);
        assert_eq!(arena.to_repr(root), "tau");
    }

    #[test]
    fn xor_to_xor() {
        let tree = ProcessTree::internal(
            crate::powl_process_tree::PtOperator::Xor,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
            ],
        );
        let (arena, root) = apply(&tree);
        assert_eq!(arena.to_repr(root), "X ( A, B )");
    }

    #[test]
    fn loop_to_loop() {
        let tree = ProcessTree::internal(
            crate::powl_process_tree::PtOperator::Loop,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(None), // silent redo
            ],
        );
        let (arena, root) = apply(&tree);
        assert_eq!(arena.to_repr(root), "* ( A, tau )");
    }

    #[test]
    fn parallel_to_spo_no_edges() {
        let tree = ProcessTree::internal(
            crate::powl_process_tree::PtOperator::Parallel,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
            ],
        );
        let (arena, root) = apply(&tree);
        let repr = arena.to_repr(root);
        // Parallel = SPO with no edges
        assert!(repr.contains("A") && repr.contains("B"), "got: {}", repr);
        assert!(
            !repr.contains("-->"),
            "parallel should have no edges, got: {}",
            repr
        );
    }

    #[test]
    fn sequence_to_spo_total_order() {
        let tree = ProcessTree::internal(
            crate::powl_process_tree::PtOperator::Sequence,
            vec![
                ProcessTree::leaf(Some("A".to_string())),
                ProcessTree::leaf(Some("B".to_string())),
                ProcessTree::leaf(Some("C".to_string())),
            ],
        );
        let (arena, root) = apply(&tree);
        let repr = arena.to_repr(root);
        assert!(
            repr.contains("A-->B"),
            "sequence should have A-->B, got: {}",
            repr
        );
        assert!(
            repr.contains("A-->C"),
            "sequence should have A-->C, got: {}",
            repr
        );
        assert!(
            repr.contains("B-->C"),
            "sequence should have B-->C, got: {}",
            repr
        );
    }

    #[test]
    fn nested_xor() {
        let tree = ProcessTree::internal(
            crate::powl_process_tree::PtOperator::Xor,
            vec![
                ProcessTree::internal(
                    crate::powl_process_tree::PtOperator::Xor,
                    vec![
                        ProcessTree::leaf(Some("A".to_string())),
                        ProcessTree::leaf(Some("B".to_string())),
                    ],
                ),
                ProcessTree::leaf(Some("C".to_string())),
            ],
        );
        let (arena, root) = apply(&tree);
        // Simplification should flatten nested XOR
        let repr = arena.to_repr(root);
        assert!(
            repr.contains("A") && repr.contains("B") && repr.contains("C"),
            "got: {}",
            repr
        );
    }

    #[test]
    fn roundtrip_xor() {
        use crate::powl::conversion::to_process_tree;
        use crate::powl_parser::parse_powl_model_string;

        // POWL → Process Tree → POWL should preserve XOR structure
        let mut arena1 = PowlArena::new();
        let root1 = parse_powl_model_string("X ( A, B )", &mut arena1).unwrap();
        let pt = to_process_tree::apply(&arena1, root1);
        let pt_json = serde_json::to_string(&pt).unwrap();

        let (arena2, root2) = process_tree_to_powl(&pt_json).unwrap();
        let repr = arena2.to_repr(root2);
        assert!(
            repr.contains("A") && repr.contains("B"),
            "roundtrip lost activities: {}",
            repr
        );
    }
}
