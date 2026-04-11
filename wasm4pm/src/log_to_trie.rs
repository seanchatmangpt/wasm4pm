//! Prefix tree (trie) discovery from event logs.
//!
//! **Reference**: `pm4py.algo.transformation.log_to_trie`
//!
//! Builds a trie (prefix tree) from an event log. Each unique trace prefix
//! becomes a node in the tree, allowing efficient prefix-based operations
//! like log comparison and compression.

use crate::error::{codes, wasm_err};
use crate::models::EventLog;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Trie node representing a single activity in the prefix tree.
///
/// Each node contains:
/// - `label`: The activity name (None for the root node)
/// - `parent`: Index of parent node (None for root, used for tree reconstruction)
/// - `children`: List of child node indices
/// - `is_final`: True if this node represents the end of a trace
/// - `depth`: Depth in the tree (root = 0)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrieNode {
    /// Activity name (None for root node)
    pub label: Option<String>,
    /// Index of parent node in the nodes array (None for root)
    pub parent: Option<usize>,
    /// Indices of child nodes in the nodes array
    pub children: Vec<usize>,
    /// True if this node marks the end of a trace
    #[serde(rename = "final")]
    pub is_final: bool,
    /// Depth in the tree (root = 0, increments by 1 per level)
    pub depth: usize,
}

impl TrieNode {
    /// Create a new root node (depth 0, no label, no parent).
    pub fn root() -> Self {
        TrieNode {
            label: None,
            parent: None,
            children: Vec::new(),
            is_final: false,
            depth: 0,
        }
    }

    /// Create a new child node with the given label and parent.
    pub fn child(label: String, parent: usize, depth: usize) -> Self {
        TrieNode {
            label: Some(label),
            parent: Some(parent),
            children: Vec::new(),
            is_final: false,
            depth,
        }
    }
}

/// A complete trie structure containing all nodes.
///
/// The trie is stored as a flat vector of nodes for efficient serialization.
/// The root is always at index 0.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trie {
    /// All nodes in the trie (index 0 is always the root)
    pub nodes: Vec<TrieNode>,
}

impl Trie {
    /// Create a new empty trie with just a root node.
    pub fn new() -> Self {
        Trie {
            nodes: vec![TrieNode::root()],
        }
    }

    /// Get the root node (index 0).
    pub fn root(&self) -> &TrieNode {
        &self.nodes[0]
    }

    /// Find or create a child node with the given label from the given parent.
    ///
    /// Returns the index of the child node.
    pub fn get_or_create_child(&mut self, parent_idx: usize, label: &str) -> usize {
        let parent = &self.nodes[parent_idx];
        let depth = parent.depth + 1;

        // Check if child with this label already exists
        for &child_idx in &parent.children {
            if let Some(ref child_label) = self.nodes[child_idx].label {
                if child_label == label {
                    return child_idx;
                }
            }
        }

        // Create new child
        let child_idx = self.nodes.len();
        self.nodes
            .push(TrieNode::child(label.to_string(), parent_idx, depth));
        self.nodes[parent_idx].children.push(child_idx);
        child_idx
    }

    /// Mark a node as final (end of trace).
    pub fn mark_final(&mut self, node_idx: usize) {
        self.nodes[node_idx].is_final = true;
    }

    /// Get the maximum depth of the trie.
    pub fn max_depth(&self) -> usize {
        self.nodes.iter().map(|n| n.depth).max().unwrap_or(0)
    }

    /// Get the number of final nodes (unique trace variants).
    pub fn variant_count(&self) -> usize {
        self.nodes.iter().filter(|n| n.is_final).count()
    }
}

/// Result of prefix tree discovery.
///
/// Contains the trie structure along with summary statistics.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrefixTreeResult {
    /// Number of unique trace variants (paths marked as final)
    pub variants: usize,
    /// Maximum depth of the trie (longest trace length)
    pub max_depth: usize,
    /// The trie structure with all nodes
    pub tree: Trie,
}

/// Discover a prefix tree (trie) from an event log.
///
/// Each unique trace prefix in the log becomes a path in the trie.
/// Nodes that represent the end of a trace are marked as `is_final = true`.
///
/// **Arguments:**
/// * `log` - Event log
/// * `activity_key` - Attribute key for activity names (e.g., "concept:name")
/// * `max_path_length` - Optional maximum trace length (traces are truncated)
///
/// **Returns:** A `PrefixTreeResult` with the trie and summary statistics
///
/// Mirrors `pm4py.discover_prefix_tree()`.
///
/// **Algorithm:**
/// 1. Get all unique variants from the log
/// 2. For each variant, walk down the trie creating nodes as needed
/// 3. Mark the final node of each variant as `is_final = true`
pub fn discover_prefix_tree_inner(
    log: &EventLog,
    activity_key: &str,
    max_path_length: Option<usize>,
) -> Result<PrefixTreeResult, String> {
    let variants = get_variants_from_log(log, activity_key)?;
    let mut trie = Trie::new();

    for variant in &variants {
        // Truncate variant if max_path_length is specified
        let activities = if let Some(max_len) = max_path_length {
            if variant.activities.len() > max_len {
                &variant.activities[..max_len]
            } else {
                &variant.activities
            }
        } else {
            &variant.activities
        };

        // Walk down the trie, creating nodes as needed
        let mut current_idx = 0; // Start at root

        for (i, activity) in activities.iter().enumerate() {
            // Find or create child node with this activity
            current_idx = trie.get_or_create_child(current_idx, activity);

            // Mark as final if this is the last activity in the variant
            if i == activities.len() - 1 {
                trie.mark_final(current_idx);
            }
        }
    }

    let max_depth = trie.max_depth();
    let variant_count = trie.variant_count();

    Ok(PrefixTreeResult {
        variants: variant_count,
        max_depth,
        tree: trie,
    })
}

/// Get variants from an event log.
///
/// This is a helper function that extracts unique activity sequences
/// along with their counts. Used by prefix tree discovery.
fn get_variants_from_log(
    log: &EventLog,
    activity_key: &str,
) -> Result<Vec<Variant>, String> {
    let mut variant_map: HashMap<Vec<String>, usize> = HashMap::new();

    for trace in &log.traces {
        let activities: Result<Vec<String>, String> = trace
            .events
            .iter()
            .map(|e| {
                e.attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .ok_or_else(|| {
                        format!(
                            "Event missing activity key '{}' or value is not a string",
                            activity_key
                        )
                    })
                    .map(|s| s.to_string())
            })
            .collect();

        let activities = activities?;
        *variant_map.entry(activities).or_insert(0) += 1;
    }

    // Convert to Variant structs
    Ok(variant_map
        .into_iter()
        .map(|(activities, count)| Variant { activities, count })
        .collect())
}

/// A variant represents a unique trace with its frequency.
#[derive(Clone, Debug)]
struct Variant {
    activities: Vec<String>,
    #[allow(dead_code)]
    count: usize,
}

/// WASM export: Discover a prefix tree from an event log.
///
/// **Arguments:**
/// * `eventlog_handle` - Handle to the stored EventLog object
/// * `activity_key` - Attribute key for activity names (e.g., "concept:name")
/// * `max_path_length` - Optional maximum trace length (0 = no limit)
///
/// **Returns:** JSON object with:
/// - `variants`: Number of unique trace variants
/// - `max_depth`: Maximum depth of the trie
/// - `tree`: The trie structure with nested nodes
#[wasm_bindgen]
pub fn discover_prefix_tree(
    eventlog_handle: &str,
    activity_key: &str,
    max_path_length: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let max_len = if max_path_length > 0 {
                Some(max_path_length)
            } else {
                None
            };

            match discover_prefix_tree_inner(log, activity_key, max_len) {
                Ok(result) => to_js(&result),
                Err(e) => Err(wasm_err(codes::INVALID_INPUT, e)),
            }
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Event, Trace};

    fn make_test_log(activities: Vec<Vec<&str>>) -> EventLog {
        let traces = activities
            .into_iter()
            .map(|acts| Trace {
                attributes: HashMap::new(),
                events: acts
                    .into_iter()
                    .map(|a| {
                        let mut attrs = HashMap::new();
                        attrs.insert("concept:name".to_string(), AttributeValue::String(a.to_string()));
                        Event { attributes: attrs }
                    })
                    .collect(),
            })
            .collect();
        EventLog {
            attributes: HashMap::new(),
            traces,
        }
    }

    #[test]
    fn test_discover_prefix_tree_simple() {
        let log = make_test_log(vec![vec!["A", "B"], vec!["A", "C"]]);
        let result = discover_prefix_tree_inner(&log, "concept:name", None).unwrap();

        // Should have 2 variants
        assert_eq!(result.variants, 2);

        // Root should have one child: A
        assert_eq!(result.tree.root().children.len(), 1);

        // A should have two children: B and C
        let a_idx = result.tree.root().children[0];
        assert_eq!(result.tree.nodes[a_idx].children.len(), 2);

        // Both B and C should be marked as final
        let b_idx = result.tree.nodes[a_idx].children[0];
        let c_idx = result.tree.nodes[a_idx].children[1];
        assert!(result.tree.nodes[b_idx].is_final);
        assert!(result.tree.nodes[c_idx].is_final);
    }

    #[test]
    fn test_discover_prefix_tree_reuse_path() {
        let log = make_test_log(vec![vec!["A", "B"], vec!["A", "B", "C"]]);
        let result = discover_prefix_tree_inner(&log, "concept:name", None).unwrap();

        // Should have 2 variants
        assert_eq!(result.variants, 2);

        // Root -> A -> B (shared path)
        let a_idx = result.tree.root().children[0];
        let b_idx = result.tree.nodes[a_idx].children[0];

        // B should have one child: C
        assert_eq!(result.tree.nodes[b_idx].children.len(), 1);

        // B should be final (first trace ends at B)
        assert!(result.tree.nodes[b_idx].is_final);

        // C should be final
        let c_idx = result.tree.nodes[b_idx].children[0];
        assert!(result.tree.nodes[c_idx].is_final);
    }

    #[test]
    fn test_discover_prefix_tree_max_length() {
        let log = make_test_log(vec![vec!["A", "B", "C", "D"]]);
        let result = discover_prefix_tree_inner(&log, "concept:name", Some(2)).unwrap();

        // Should only have A -> B (truncated to 2)
        assert_eq!(result.max_depth, 2);

        let a_idx = result.tree.root().children[0];
        assert_eq!(result.tree.nodes[a_idx].children.len(), 1);

        let b_idx = result.tree.nodes[a_idx].children[0];
        assert_eq!(result.tree.nodes[b_idx].children.len(), 0);
        assert!(result.tree.nodes[b_idx].is_final);
    }

    #[test]
    fn test_discover_prefix_tree_single_activity() {
        let log = make_test_log(vec![vec!["A"]]);
        let result = discover_prefix_tree_inner(&log, "concept:name", None).unwrap();

        // Root -> A
        let a_idx = result.tree.root().children[0];
        assert_eq!(
            result.tree.nodes[a_idx].label.as_deref(),
            Some("A")
        );
        assert!(result.tree.nodes[a_idx].is_final);
        assert_eq!(result.variants, 1);
    }

    #[test]
    fn test_discover_prefix_tree_empty_log() {
        let log = EventLog {
            attributes: HashMap::new(),
            traces: vec![],
        };
        let result = discover_prefix_tree_inner(&log, "concept:name", None).unwrap();

        // Should have just the root node
        assert_eq!(result.tree.nodes.len(), 1);
        assert!(result.tree.root().children.is_empty());
        assert_eq!(result.variants, 0);
        assert_eq!(result.max_depth, 0);
    }

    #[test]
    fn test_trie_get_or_create_child_reuses() {
        let mut trie = Trie::new();
        let idx1 = trie.get_or_create_child(0, "A");
        let idx2 = trie.get_or_create_child(0, "A");
        assert_eq!(idx1, idx2);
        assert_eq!(trie.nodes[0].children.len(), 1);
    }

    #[test]
    fn test_trie_mark_final() {
        let mut trie = Trie::new();
        let child_idx = trie.get_or_create_child(0, "A");
        trie.mark_final(child_idx);
        assert!(trie.nodes[child_idx].is_final);
    }

    #[test]
    fn test_trie_max_depth() {
        let mut trie = Trie::new();
        let a_idx = trie.get_or_create_child(0, "A");
        let b_idx = trie.get_or_create_child(a_idx, "B");
        let _c_idx = trie.get_or_create_child(b_idx, "C");

        assert_eq!(trie.max_depth(), 3);
    }

    #[test]
    fn test_trie_variant_count() {
        let mut trie = Trie::new();
        let a_idx = trie.get_or_create_child(0, "A");
        let b_idx = trie.get_or_create_child(a_idx, "B");
        let c_idx = trie.get_or_create_child(a_idx, "C");

        trie.mark_final(b_idx);
        trie.mark_final(c_idx);

        assert_eq!(trie.variant_count(), 2);
    }

    #[test]
    fn test_discover_prefix_tree_duplicate_variants() {
        let log = make_test_log(vec![
            vec!["A", "B"],
            vec!["A", "B"],
            vec!["A", "B"],
        ]);
        let result = discover_prefix_tree_inner(&log, "concept:name", None).unwrap();

        // Should have only 1 variant (all traces are identical)
        assert_eq!(result.variants, 1);

        // Root -> A -> B path
        let a_idx = result.tree.root().children[0];
        let b_idx = result.tree.nodes[a_idx].children[0];
        assert!(result.tree.nodes[b_idx].is_final);
    }
}
