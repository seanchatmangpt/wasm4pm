//! Process tree — block-structured process model with operators {→, ×, ∧, ↺}.
//!
//! Paper grounding: Leemans, Fahland & van der Aalst (2013) ICATPN LNCS 7927 —
//! "Discovering Block-Structured Process Models from Event Logs Containing Infrequent Behaviour".
//! Process trees are guaranteed sound (no deadlocks, no infinite loops) by construction.
//!
//! Formal object: T is a tree where each node is either:
//!   - A leaf: τ (silent) or an activity a ∈ A.
//!   - An inner node: operator ⊕ ∈ {→, ×, ∧, ↺} with children T₁, …, Tₙ.
//!
//! Operators:
//!   → (Sequence): execute children left to right.
//!   × (ExclusiveChoice): execute exactly one child.
//!   ∧ (Parallel): execute all children in any interleaving.
//!   ↺ (Loop): body T₁ executes, then optionally: redo T₂, body T₁, redo T₂, …

extern crate alloc;

use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec::Vec;
use crate::primitives::ActivityName;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Process tree operator (Leemans et al. 2013 §2).
///
/// Replaces the stringly-typed `node_type: String` found in wasm4pm — exhaustive
/// pattern matching replaces string comparison, and adding a new operator is a
/// compiler error at all match sites.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum ProcessOperator {
    /// → Sequence: children execute in order.
    Sequence,
    /// × ExclusiveChoice (XOR): exactly one child executes.
    ExclusiveChoice,
    /// ∧ Parallel (AND): all children execute in any interleaving.
    Parallel,
    /// ↺ Loop: body executes, then optionally (redo; body)*.
    /// First child = body, second child = redo branch.
    Loop,
    /// ◯ Or (inclusive choice, Leemans 2022 extension): one or more children.
    Or,
}

impl ProcessOperator {
    /// Minimum number of children required for this operator.
    pub fn min_children(&self) -> usize {
        match self {
            ProcessOperator::Loop => 2,
            _ => 1,
        }
    }

    /// Symbol used in textual representations.
    pub fn symbol(&self) -> &'static str {
        match self {
            ProcessOperator::Sequence => "→",
            ProcessOperator::ExclusiveChoice => "×",
            ProcessOperator::Parallel => "∧",
            ProcessOperator::Loop => "↺",
            ProcessOperator::Or => "◯",
        }
    }
}

/// A node in a process tree (Leemans et al. 2013 Def. 1).
///
/// Either a leaf (silent τ or activity a ∈ A) or an operator node with children.
/// The Box indirection is the standard Rust pattern for recursive tree types.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum ProcessTreeNode {
    /// Leaf: silent (τ) activity — produces no event in the log.
    Silent,
    /// Leaf: observable activity a ∈ A.
    Activity(ActivityName),
    /// Inner node: operator ⊕ with one or more child subtrees.
    Operator {
        op: ProcessOperator,
        children: Vec<Box<ProcessTreeNode>>,
    },
}

impl ProcessTreeNode {
    pub fn silent() -> Self { ProcessTreeNode::Silent }

    pub fn activity(name: impl Into<ActivityName>) -> Self {
        ProcessTreeNode::Activity(name.into())
    }

    pub fn operator(op: ProcessOperator, children: Vec<ProcessTreeNode>) -> Self {
        ProcessTreeNode::Operator {
            op,
            children: children.into_iter().map(Box::new).collect(),
        }
    }

    /// Returns true if this is a leaf node.
    pub fn is_leaf(&self) -> bool {
        matches!(self, ProcessTreeNode::Silent | ProcessTreeNode::Activity(_))
    }

    /// Depth of the tree (leaf = 0).
    pub fn depth(&self) -> usize {
        match self {
            ProcessTreeNode::Silent | ProcessTreeNode::Activity(_) => 0,
            ProcessTreeNode::Operator { children, .. } => {
                1 + children.iter().map(|c| c.depth()).max().unwrap_or(0)
            }
        }
    }

    /// Number of leaf nodes (activities + silents).
    pub fn leaf_count(&self) -> usize {
        match self {
            ProcessTreeNode::Silent | ProcessTreeNode::Activity(_) => 1,
            ProcessTreeNode::Operator { children, .. } => {
                children.iter().map(|c| c.leaf_count()).sum()
            }
        }
    }
}

/// A complete process tree (the root node).
///
/// Guaranteed sound by construction when produced by a correct Inductive Miner
/// implementation (Leemans et al. 2013 Theorem 1).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ProcessTree {
    pub root: ProcessTreeNode,
}

impl ProcessTree {
    pub fn new(root: ProcessTreeNode) -> Self { ProcessTree { root } }
    pub fn depth(&self) -> usize { self.root.depth() }
    pub fn leaf_count(&self) -> usize { self.root.leaf_count() }
}
