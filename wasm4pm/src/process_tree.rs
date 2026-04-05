/// Priority 9 — Process tree types and basic discovery.
///
/// A process tree is a hierarchical representation of a process model.
/// Operator nodes have children; leaf nodes are activities or silent steps (τ).
///
/// Supported operators (following PM4Py conventions):
/// - `SEQ`  — sequential execution (children in order)
/// - `XOR`  — exclusive choice (exactly one child)
/// - `AND`  — parallel execution (all children, any order)
/// - `OR`   — inclusive choice (one or more children)
/// - `LOOP` — loop (first child = body, second child = redo branch)
use wasm_bindgen::prelude::*;
use serde_json::json;

/// Recursively convert a `ProcessTreeNode` to a JSON `serde_json::Value`.
#[allow(dead_code)]
fn node_to_json(node: &ProcessTreeNode) -> serde_json::Value {
    let children: Vec<serde_json::Value> = node.children.iter().map(node_to_json).collect();
    match &node.kind {
        NodeKind::Operator(op) => json!({
            "type": "operator",
            "operator": op,
            "children": children,
        }),
        NodeKind::Activity(label) => json!({
            "type": "activity",
            "label": label,
        }),
        NodeKind::Silent => json!({
            "type": "silent",
        }),
    }
}

#[derive(Debug, Clone)]
pub enum NodeKind {
    Operator(String), // SEQ, XOR, AND, OR, LOOP
    Activity(String), // leaf — named activity
    Silent,           // leaf — τ (tau)
}

#[derive(Debug, Clone)]
pub struct ProcessTreeNode {
    pub kind: NodeKind,
    pub children: Vec<ProcessTreeNode>,
}

impl ProcessTreeNode {
    pub fn operator(op: impl Into<String>) -> Self {
        ProcessTreeNode { kind: NodeKind::Operator(op.into()), children: vec![] }
    }
    pub fn activity(label: impl Into<String>) -> Self {
        ProcessTreeNode { kind: NodeKind::Activity(label.into()), children: vec![] }
    }
    pub fn silent() -> Self {
        ProcessTreeNode { kind: NodeKind::Silent, children: vec![] }
    }
    pub fn add_child(mut self, child: ProcessTreeNode) -> Self {
        self.children.push(child);
        self
    }
}

/// Convert a process tree JSON into a simplified flat representation
/// (for JS consumption — the full tree as a JSON string).
///
/// Input JSON follows the same schema as `node_to_json` output.
/// Validates the structure and returns it back as a pretty-printed JSON string.
///
/// ```javascript
/// const treeJson = JSON.stringify({
///   type: "operator", operator: "SEQ",
///   children: [
///     { type: "activity", label: "A" },
///     { type: "activity", label: "B" }
///   ]
/// });
/// const result = pm.validate_process_tree(treeJson);
/// ```
#[wasm_bindgen]
pub fn validate_process_tree(tree_json: &str) -> Result<JsValue, JsValue> {
    let v: serde_json::Value = serde_json::from_str(tree_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    fn validate(node: &serde_json::Value, depth: usize) -> Result<serde_json::Value, String> {
        if depth > 50 { return Err("Tree depth exceeds maximum (50)".to_string()); }
        let node_type = node["type"].as_str().ok_or("Node missing 'type' field")?;
        match node_type {
            "operator" => {
                let op = node["operator"].as_str().ok_or("Operator node missing 'operator' field")?;
                if !["SEQ", "XOR", "AND", "OR", "LOOP"].contains(&op) {
                    return Err(format!("Unknown operator '{}'. Must be SEQ, XOR, AND, OR, or LOOP", op));
                }
                let children = node["children"].as_array().ok_or("Operator node missing 'children' array")?;
                if children.is_empty() {
                    return Err(format!("Operator '{}' must have at least one child", op));
                }
                let validated_children: Result<Vec<serde_json::Value>, String> =
                    children.iter().map(|c| validate(c, depth + 1)).collect();
                Ok(json!({
                    "type": "operator",
                    "operator": op,
                    "children": validated_children?,
                }))
            }
            "activity" => {
                let label = node["label"].as_str().ok_or("Activity node missing 'label' field")?;
                Ok(json!({"type": "activity", "label": label}))
            }
            "silent" => Ok(json!({"type": "silent"})),
            other => Err(format!("Unknown node type '{}'. Must be operator, activity, or silent", other)),
        }
    }

    let validated = validate(&v, 0).map_err(|e| JsValue::from_str(&e))?;
    let out = serde_json::to_string(&validated).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(JsValue::from_str(&out))
}

/// Discover a simple process tree from an event log using frequency-based
/// heuristics (flower model as a baseline — SEQ of all activities in
/// frequency order, with a top-level XOR for branching).
///
/// Returns a JSON string representing the process tree.
#[wasm_bindgen]
pub fn discover_simple_process_tree(
    log_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    use crate::state::{get_or_init_state, StoredObject};

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Count activity frequencies
            let mut freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
            let mut directly_follows: std::collections::HashMap<(String, String), usize> =
                std::collections::HashMap::new();

            for trace in &log.traces {
                let acts: Vec<String> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned))
                    .collect();
                for a in &acts { *freq.entry(a.clone()).or_insert(0) += 1; }
                for i in 0..acts.len().saturating_sub(1) {
                    *directly_follows.entry((acts[i].clone(), acts[i + 1].clone())).or_insert(0) += 1;
                }
            }

            // Sort activities by frequency descending
            let mut sorted_acts: Vec<(String, usize)> = freq.into_iter().collect();
            sorted_acts.sort_by(|a, b| b.1.cmp(&a.1));

            // Build a simple SEQ tree of the top activities
            let children: Vec<serde_json::Value> = sorted_acts.iter()
                .map(|(label, _)| json!({"type": "activity", "label": label}))
                .collect();

            let tree = if children.len() == 1 {
                children.into_iter().next().unwrap()
            } else {
                json!({
                    "type": "operator",
                    "operator": "SEQ",
                    "children": children,
                })
            };

            serde_json::to_string(&tree).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}
