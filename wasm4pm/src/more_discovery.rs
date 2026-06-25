use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::{BTreeSet, HashSet};
use wasm4pm_compat::powl::{ChoiceGraph, ChoiceGraphNode};
use wasm_bindgen::prelude::*;

/// Inductive Miner - recursive structure discovery via cuts
/// Implements IM-basic (no noise filtering, all directly-follows preserved)
/// Returns ProcessTree via XOR/Sequence/Parallel/Loop cuts
/// Pure-Rust Inductive Miner: returns JSON string with the discovered process tree.
/// Testable without wasm-bindgen runtime.
/// Helper to convert recursive `ProcessTreeNode` to flat compat `ProcessTree`.
pub fn convert_to_compat_tree(node: &ProcessTreeNode) -> wasm4pm_compat::process_tree::ProcessTree {
    let mut tree = wasm4pm_compat::process_tree::ProcessTree::new();
    let root_id = convert_node_recursive(node, &mut tree);
    tree.root = Some(root_id);
    tree
}

fn convert_node_recursive(
    node: &ProcessTreeNode,
    tree: &mut wasm4pm_compat::process_tree::ProcessTree,
) -> wasm4pm_compat::process_tree::ProcessTreeNodeId {
    let compat_node = match node.node_type.as_str() {
        "leaf" => {
            let label = node.label.clone().unwrap_or_default();
            wasm4pm_compat::process_tree::ProcessTreeNode::Activity(label)
        }
        _ => {
            let op = match node.node_type.as_str() {
                "sequence" => wasm4pm_compat::process_tree::ProcessTreeOperator::Sequence,
                "xor" => wasm4pm_compat::process_tree::ProcessTreeOperator::Xor,
                "parallel" => wasm4pm_compat::process_tree::ProcessTreeOperator::Parallel,
                "loop" => wasm4pm_compat::process_tree::ProcessTreeOperator::Loop,
                "or" => wasm4pm_compat::process_tree::ProcessTreeOperator::Or,
                _ => wasm4pm_compat::process_tree::ProcessTreeOperator::Silent,
            };
            let parent_id = wasm4pm_compat::process_tree::ProcessTreeNodeId(tree.nodes.len());
            tree.nodes
                .push(wasm4pm_compat::process_tree::ProcessTreeNode::Activity(
                    String::new(),
                ));

            let mut child_ids = Vec::new();
            for child in &node.children {
                child_ids.push(convert_node_recursive(child, tree));
            }

            tree.nodes[parent_id.0] = wasm4pm_compat::process_tree::ProcessTreeNode::Operator {
                operator: op,
                children: child_ids,
            };

            return parent_id;
        }
    };

    let id = wasm4pm_compat::process_tree::ProcessTreeNodeId(tree.nodes.len());
    tree.nodes.push(compat_node);
    id
}

/// Helper to convert recursive `PowlArena` to compat `Powl` model.
pub fn convert_to_compat_powl(
    arena: &crate::powl_arena::PowlArena,
    root: u32,
) -> wasm4pm_compat::powl::Powl {
    let mut powl = wasm4pm_compat::powl::Powl::new();
    let root_id = convert_powl_node_recursive(root, arena, &mut powl);
    powl.root = Some(root_id);
    powl
}

fn convert_powl_node_recursive(
    idx: u32,
    arena: &crate::powl_arena::PowlArena,
    powl: &mut wasm4pm_compat::powl::Powl,
) -> wasm4pm_compat::powl::PowlNodeId {
    use crate::powl_arena::{Operator as ArenaOperator, PowlNode as ArenaNode};

    let node = &arena.nodes[idx as usize];
    let kind = match node {
        ArenaNode::Transition(t) => {
            if let Some(lbl) = &t.label {
                wasm4pm_compat::powl::PowlNodeKind::Atom(lbl.clone())
            } else {
                wasm4pm_compat::powl::PowlNodeKind::Silent
            }
        }
        ArenaNode::FrequentTransition(t) => {
            wasm4pm_compat::powl::PowlNodeKind::Atom(t.activity.clone())
        }
        ArenaNode::OperatorPowl(op) => match op.operator {
            ArenaOperator::Xor => {
                let mut child_ids = Vec::new();
                for &child in &op.children {
                    child_ids.push(convert_powl_node_recursive(child, arena, powl));
                }
                
                let start_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(start_id, wasm4pm_compat::powl::PowlNodeKind::Silent));
                
                let end_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(end_id, wasm4pm_compat::powl::PowlNodeKind::Silent));
                
                let mut nodes = vec![start_id];
                nodes.extend(&child_ids);
                nodes.push(end_id);
                
                let mut edges = Vec::new();
                for &cid in &child_ids {
                    edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(start_id, cid));
                    edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(cid, end_id));
                }
                
                wasm4pm_compat::powl::PowlNodeKind::ChoiceGraph { nodes, edges }
            }
            ArenaOperator::Loop => {
                let body = if !op.children.is_empty() {
                    convert_powl_node_recursive(op.children[0], arena, powl)
                } else {
                    let id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                    powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(
                        id,
                        wasm4pm_compat::powl::PowlNodeKind::Silent,
                    ));
                    id
                };
                let redo = if op.children.len() >= 2 {
                    convert_powl_node_recursive(op.children[1], arena, powl)
                } else {
                    let id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                    powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(id, wasm4pm_compat::powl::PowlNodeKind::Silent));
                    id
                };
                
                let start_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(start_id, wasm4pm_compat::powl::PowlNodeKind::Silent));
                
                let end_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(end_id, wasm4pm_compat::powl::PowlNodeKind::Silent));
                
                let nodes = vec![start_id, body, redo, end_id];
                
                let edges = vec![
                    wasm4pm_compat::powl::ChoiceGraphEdge::new(start_id, body),
                    wasm4pm_compat::powl::ChoiceGraphEdge::new(body, end_id),
                    wasm4pm_compat::powl::ChoiceGraphEdge::new(body, redo),
                    wasm4pm_compat::powl::ChoiceGraphEdge::new(redo, body),
                ];
                
                wasm4pm_compat::powl::PowlNodeKind::ChoiceGraph { nodes, edges }
            }
            ArenaOperator::PartialOrder => {
                let mut child_ids = Vec::new();
                for &child in &op.children {
                    child_ids.push(convert_powl_node_recursive(child, arena, powl));
                }
                wasm4pm_compat::powl::PowlNodeKind::PartialOrder(child_ids)
            }
        },
        ArenaNode::StrictPartialOrder(spo) => {
            let mut child_ids = Vec::new();
            for &child in &spo.children {
                child_ids.push(convert_powl_node_recursive(child, arena, powl));
            }
            let n = spo.children.len();
            for i in 0..n {
                for j in 0..n {
                    if spo.order.is_edge(i, j) {
                        powl.edges.push(wasm4pm_compat::powl::OrderEdge::new(
                            child_ids[i],
                            child_ids[j],
                        ));
                    }
                }
            }
            wasm4pm_compat::powl::PowlNodeKind::PartialOrder(child_ids)
        }
        ArenaNode::DecisionGraph(dg) => {
            let mut child_ids = Vec::new();
            for &child in &dg.children {
                child_ids.push(convert_powl_node_recursive(child, arena, powl));
            }
            let mut cg_node_ids = Vec::new();
            let start_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
            powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(
                start_id,
                wasm4pm_compat::powl::PowlNodeKind::Silent,
            ));
            cg_node_ids.push(start_id);
            for cid in child_ids {
                cg_node_ids.push(cid);
            }
            let end_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
            powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(
                end_id,
                wasm4pm_compat::powl::PowlNodeKind::Silent,
            ));
            cg_node_ids.push(end_id);

            let mut cg_edges = Vec::new();
            let n = dg.children.len();
            for i in 0..n {
                for j in 0..n {
                    if dg.order.is_edge(i, j) {
                        cg_edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(
                            cg_node_ids[i + 1],
                            cg_node_ids[j + 1],
                        ));
                    }
                }
            }
            for &start_local in &dg.start_nodes {
                cg_edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(
                    start_id,
                    cg_node_ids[start_local + 1],
                ));
            }
            for &end_local in &dg.end_nodes {
                cg_edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(
                    cg_node_ids[end_local + 1],
                    end_id,
                ));
            }
            if dg.empty_path {
                cg_edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(start_id, end_id));
            }
            wasm4pm_compat::powl::PowlNodeKind::ChoiceGraph {
                nodes: cg_node_ids,
                edges: cg_edges,
            }
        }
        ArenaNode::ChoiceGraph(cg) => {
            let mut cg_node_ids = Vec::new();
            for n in cg.graph.nodes() {
                match n {
                    ChoiceGraphNode::Start => {
                        let id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                        powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(
                            id,
                            wasm4pm_compat::powl::PowlNodeKind::Silent,
                        ));
                        cg_node_ids.push(id);
                    }
                    ChoiceGraphNode::End => {
                        let id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                        powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(
                            id,
                            wasm4pm_compat::powl::PowlNodeKind::Silent,
                        ));
                        cg_node_ids.push(id);
                    }
                    ChoiceGraphNode::Activity(lbl) => {
                        let id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
                        powl.nodes.push(wasm4pm_compat::powl::PowlNode::new(
                            id,
                            wasm4pm_compat::powl::PowlNodeKind::Atom(lbl.clone()),
                        ));
                        cg_node_ids.push(id);
                    }
                    ChoiceGraphNode::SubModel(sub_idx) => {
                        let child_id = convert_powl_node_recursive(*sub_idx, arena, powl);
                        cg_node_ids.push(child_id);
                    }
                }
            }
            let mut cg_edges = Vec::new();
            for &(from_idx, to_idx) in cg.graph.edges() {
                cg_edges.push(wasm4pm_compat::powl::ChoiceGraphEdge::new(
                    cg_node_ids[from_idx],
                    cg_node_ids[to_idx],
                ));
            }
            wasm4pm_compat::powl::PowlNodeKind::ChoiceGraph {
                nodes: cg_node_ids,
                edges: cg_edges,
            }
        }
    };

    let parent_id = wasm4pm_compat::powl::PowlNodeId(powl.nodes.len());
    powl.nodes
        .push(wasm4pm_compat::powl::PowlNode::new(parent_id, kind));
    parent_id
}

/// POWL discovery implementation returning TypedPowl.
pub struct PowerMiner;

impl PowerMiner {
    /// Discover a POWL model from an admitted event log.
    pub fn discover<W>(log: &AdmittedEventLog<W>, activity_key: &str) -> Result<TypedPowl, String> {
        let config = crate::powl::discovery::DiscoveryConfig {
            activity_key: activity_key.to_string(),
            variant: crate::powl::discovery::DiscoveryVariant::DecisionGraphCyclic,
            min_trace_count: 1,
            noise_threshold: 0.0,
            from_dfg: false,
            fall_through_fired: false,
        };
        let (arena, root) = crate::powl::discovery::discover_powl(&log.value, &config)?;
        let compat_powl = convert_to_compat_powl(&arena, root);
        compat_powl.validate().map_err(|e| e.to_string())?;
        Ok(
            wasm4pm_compat::admission::Admission::<_, wasm4pm_compat::witness::PowlPaper>::new(
                compat_powl,
            )
            .into_evidence(),
        )
    }
}

/// Inductive Miner discovery implementation returning TypedProcessTree.
pub struct InductiveMiner;

impl InductiveMiner {
    /// Discover a process tree from an admitted event log.
    pub fn discover<W>(
        log: &AdmittedEventLog<W>,
        activity_key: &str,
    ) -> Result<TypedProcessTree, String> {
        let activities = log.value.get_activities(activity_key);
        let mut sorted_acts: Vec<_> = activities.to_vec();
        sorted_acts.sort_unstable(); // Deterministic ordering
        let recursive_tree = inductive_miner_recursive(&log.value, &sorted_acts, activity_key, 0)
            .map_err(|e| {
            e.as_string()
                .unwrap_or_else(|| "Inductive miner discovery failed".to_string())
        })?;

        let compat_tree = convert_to_compat_tree(&recursive_tree);
        Ok(wasm4pm_compat::admission::Admission::<_, wasm4pm_compat::witness::InductiveMiner>::new(compat_tree)
            .into_evidence())
    }
}

/// Pure-Rust Inductive Miner: returns JSON string with the discovered process tree.
/// Testable without wasm-bindgen runtime.
pub fn discover_inductive_miner_from_log<W>(
    log: &AdmittedEventLog<W>,
    activity_key: &str,
) -> String {
    let activities = log.value.get_activities(activity_key);
    let mut sorted_acts: Vec<_> = activities.to_vec();
    sorted_acts.sort_unstable();
    match inductive_miner_recursive(&log.value, &sorted_acts, activity_key, 0) {
        Ok(tree) => {
            let nodes = tree.count_nodes();
            serde_json::to_string(&json!({
                "algorithm": "inductive_miner",
                "root": tree,
                "nodes": nodes,
            }))
            .unwrap_or_else(|_| r#"{"error":"serialize"}"#.to_string())
        }
        Err(_) => r#"{"error":"discovery"}"#.to_string(),
    }
}

/// Discover a process tree using the Inductive Miner algorithm.
///
/// Guarantees a **sound** process model (no deadlocks, always-terminates). The output
/// is a recursive process tree rather than a DFG or Petri net.
///
/// # Parameters
/// * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// * `activity_key` — XES attribute to use as activity label (e.g. `"concept:name"`).
///
/// # Returns
/// `Result<JsValue, JsValue>` — On success:
/// ```json
/// {
///   "algorithm": "inductive_miner",
///   "root": { "node_type": "sequence" | "xor" | "parallel" | "loop" | "leaf", "label": "...", "children": [...] },
///   "nodes": 7
/// }
/// ```
///
/// # Note
/// Activities are sorted deterministically before splitting. The tree structure is always
/// deterministic for the same input log. Use this instead of `discover_dfg` when you need
/// soundness guarantees.
#[wasm_bindgen]
pub fn discover_inductive_miner(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.inductive_miner",
        algorithm = "inductive_miner",
        activity_key = activity_key,
        "Inductive Miner discovery started"
    );

    let tree = get_or_init_state().with_event_log(eventlog_handle, |log| {
        let activities = log.get_activities(activity_key);
        let activity_count = activities.len();

        tracing::info!(
            target: "wasm4pm.discovery.inductive_miner",
            checkpoint = "feature_extraction",
            log_size = log.traces.len(),
            activity_count = activity_count,
            "Log loaded and activity vocabulary built"
        );

        let mut sorted_acts: Vec<_> = activities.to_vec();
        sorted_acts.sort_unstable(); // Deterministic ordering

        let admitted =
            wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
        inductive_miner_recursive(&admitted.value, &sorted_acts, activity_key, 0)
    })?;

    let nodes = tree.count_nodes();

    tracing::info!(
        target: "wasm4pm.discovery.inductive_miner",
        checkpoint = "result_generation",
        node_count = nodes,
        "Process tree constructed"
    );

    let result = json!({
        "algorithm": "inductive_miner",
        "root": tree,
        "nodes": nodes,
    });
    to_js_str(&result)
}

fn inductive_miner_recursive(
    log: &EventLog,
    activities: &[String],
    activity_key: &str,
    depth: usize,
) -> Result<ProcessTreeNode, JsValue> {
    // Base case: single activity
    if activities.len() == 1 {
        return Ok(ProcessTreeNode::leaf(activities[0].clone()));
    }

    // Depth limit: prevent stack overflow on cyclic logs
    if depth > 100 {
        return Ok(ProcessTreeNode::flower());
    }

    // Build directly-follows on this subset
    let df = build_df_subset(log, activities, activity_key);

    // Try cuts in order: XOR → Sequence → Parallel → Loop

    // 1. XOR cut: partition with no edges between sets
    if let Some((left, right)) = find_xor_cut(activities, &df) {
        let left_tree = inductive_miner_recursive(log, &left, activity_key, depth + 1)?;
        let right_tree = inductive_miner_recursive(log, &right, activity_key, depth + 1)?;
        return Ok(ProcessTreeNode::xor(vec![left_tree, right_tree]));
    }

    // 2. Sequence cut: A→B partition (all A edges → B, all B edges ← A)
    if let Some((left, right)) = find_sequence_cut(activities, &df) {
        let left_tree = inductive_miner_recursive(log, &left, activity_key, depth + 1)?;
        let right_tree = inductive_miner_recursive(log, &right, activity_key, depth + 1)?;
        return Ok(ProcessTreeNode::sequence(vec![left_tree, right_tree]));
    }

    // 3. Parallel cut: all pairs have bidirectional edges
    if let Some(partitions) = find_parallel_cut(activities, &df) {
        if partitions.len() > 1 {
            let mut trees = Vec::new();
            for partition in partitions {
                trees.push(inductive_miner_recursive(
                    log,
                    &partition,
                    activity_key,
                    depth + 1,
                )?);
            }
            return Ok(ProcessTreeNode::parallel(trees));
        }
    }

    // 4. Loop cut: partition where right has edges back to left
    if let Some((left, right)) = find_loop_cut(activities, &df) {
        let body = inductive_miner_recursive(log, &left, activity_key, depth + 1)?;
        let redo = inductive_miner_recursive(log, &right, activity_key, depth + 1)?;
        return Ok(ProcessTreeNode::loop_node(body, redo));
    }

    // 5. Fallback: flower model (all activities in loop)
    Ok(ProcessTreeNode::flower())
}

fn build_df_subset(
    log: &EventLog,
    activities: &[String],
    activity_key: &str,
) -> FxHashMap<(String, String), usize> {
    // Map activity name → index so the hot inner loop uses integer pairs
    // instead of cloned String keys. We only materialise (String,String) keys
    // once at the end, not once per directly-follows occurrence.
    let idx_map: FxHashMap<&str, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, s)| (s.as_str(), i))
        .collect();

    // Integer-keyed counting: ~12 bytes/entry vs. ~80 bytes for (String,String).
    let mut int_df: FxHashMap<(usize, usize), usize> = FxHashMap::default();

    for trace in &log.traces {
        for i in 0..trace.events.len().saturating_sub(1) {
            let curr = trace.events[i].attributes.get(activity_key);
            let next = trace.events[i + 1].attributes.get(activity_key);

            if let (Some(AttributeValue::String(c)), Some(AttributeValue::String(n))) = (curr, next)
            {
                if let (Some(&ci), Some(&ni)) = (idx_map.get(c.as_str()), idx_map.get(n.as_str())) {
                    *int_df.entry((ci, ni)).or_default() += 1;
                }
            }
        }
    }

    // Convert integer-indexed edges back to String keys once (not per event).
    int_df
        .into_iter()
        .map(|((ci, ni), cnt)| ((activities[ci].clone(), activities[ni].clone()), cnt))
        .collect()
}

fn find_xor_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<(Vec<String>, Vec<String>)> {
    // Build index map once: activity name → position in sorted slice.
    // This converts the O(n) Vec::contains calls inside the loop to O(1) lookups.
    let idx: FxHashMap<&str, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, s)| (s.as_str(), i))
        .collect();

    for split in 1..activities.len() {
        // A node is "left" iff its index < split.
        let has_cross_edge =
            df.keys().any(
                |(from, to)| match (idx.get(from.as_str()), idx.get(to.as_str())) {
                    (Some(&fi), Some(&ti)) => (fi < split) != (ti < split),
                    _ => false,
                },
            );

        if !has_cross_edge {
            return Some((activities[..split].to_vec(), activities[split..].to_vec()));
        }
    }

    None
}

fn find_sequence_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<(Vec<String>, Vec<String>)> {
    // Build index map once for O(1) membership tests.
    let idx: FxHashMap<&str, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, s)| (s.as_str(), i))
        .collect();

    for split in 1..activities.len() {
        let mut valid = true;

        for (from, to) in df.keys() {
            let fi = idx.get(from.as_str()).copied();
            let ti = idx.get(to.as_str()).copied();
            // left  = index < split, right = index >= split
            match (fi, ti) {
                (Some(f), Some(t)) => {
                    let f_left = f < split;
                    let t_left = t < split;
                    // Disallowed: left→left, right→right, right→left
                    if f_left == t_left || (!f_left && t_left) {
                        valid = false;
                        break;
                    }
                }
                _ => {}
            }
        }

        if valid {
            return Some((activities[..split].to_vec(), activities[split..].to_vec()));
        }
    }

    None
}

fn find_parallel_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<Vec<Vec<String>>> {
    let n = activities.len();
    if n < 2 {
        return None;
    }

    // Build an integer-indexed edge set to avoid String clones in the O(n²) loop
    // below. The df map uses (String,String) keys; a single pass converts those
    // keys to (usize,usize) index pairs so that inner-loop membership tests are
    // O(1) integer comparisons with zero heap allocation.
    let idx_map: FxHashMap<&str, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, s)| (s.as_str(), i))
        .collect();
    // Use a flat bitset-style approach: for n ≤ usize activities, store adjacency
    // as a HashSet of (usize,usize) pairs.  This is built once and queried O(1).
    use rustc_hash::FxHashSet;
    let df_idx: FxHashSet<(usize, usize)> = df
        .keys()
        .filter_map(|(from, to)| Some((*idx_map.get(from.as_str())?, *idx_map.get(to.as_str())?)))
        .collect();

    // Union-Find: group activities connected by bidirectional df-edges.
    let mut parent: Vec<usize> = (0..n).collect();

    fn uf_find(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x {
            parent[x] = parent[parent[x]]; // path compression (halving)
            x = parent[x];
        }
        x
    }

    fn uf_union(parent: &mut [usize], a: usize, b: usize) {
        let ra = uf_find(parent, a);
        let rb = uf_find(parent, b);
        if ra != rb {
            parent[ra] = rb;
        }
    }

    for i in 0..n {
        for j in (i + 1)..n {
            // Integer-indexed lookup: zero String allocations per pair.
            let ab = df_idx.contains(&(i, j));
            let ba = df_idx.contains(&(j, i));
            if ab && ba {
                uf_union(&mut parent, i, j);
            }
        }
    }

    // Collect groups, sorting by root for deterministic output.
    let mut groups: FxHashMap<usize, Vec<String>> = FxHashMap::default();
    for (i, activity) in activities.iter().enumerate() {
        let root = uf_find(&mut parent, i);
        groups.entry(root).or_default().push(activity.clone());
    }

    if groups.len() < 2 {
        return None;
    }

    let mut result: Vec<Vec<String>> = groups.into_values().collect();
    result.sort_by_key(|x| x[0].clone()); // deterministic order
    Some(result)
}

fn find_loop_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<(Vec<String>, Vec<String>)> {
    // Build index map once for O(1) membership tests instead of O(n) Vec::contains.
    let idx: FxHashMap<&str, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, s)| (s.as_str(), i))
        .collect();

    // Body→Redo partition where Redo has edges back to Body.
    // body  = activities[..split] (index < split)
    // redo  = activities[split..] (index >= split)
    for split in 1..activities.len() {
        let has_redo_to_body =
            df.keys().any(
                |(from, to)| match (idx.get(from.as_str()), idx.get(to.as_str())) {
                    (Some(&fi), Some(&ti)) => fi >= split && ti < split,
                    _ => false,
                },
            );

        if has_redo_to_body {
            return Some((activities[..split].to_vec(), activities[split..].to_vec()));
        }
    }

    None
}

/// Ant Colony Optimization - pheromone-based model discovery
/// Layer 6b: Edge-set representation with integer-keyed pheromone map
#[wasm_bindgen]
pub fn discover_ant_colony(
    eventlog_handle: &str,
    activity_key: &str,
    num_ants: usize,
    iterations: usize,
) -> Result<JsValue, JsValue> {
    // REMOVED: delegates to discover_aco_algorithm (proper ACO implementation with heuristic eta and all-ant pheromone deposit)
    crate::genetic_discovery::discover_aco_algorithm(
        eventlog_handle,
        activity_key,
        num_ants,
        iterations,
    )
}

/// Simulated Annealing - thermal search for optimal models
/// Layer 6b: Edge-set representation with integer-based edge mutation
#[wasm_bindgen]
pub fn discover_simulated_annealing(
    eventlog_handle: &str,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.simulated_annealing",
        algorithm = "simulated_annealing",
        activity_key = activity_key,
        temperature = temperature,
        cooling_rate = cooling_rate,
        "Simulated Annealing discovery started"
    );

    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                tracing::info!(
                    target: "wasm4pm.discovery.simulated_annealing",
                    checkpoint = "feature_extraction",
                    log_size = log.traces.len(),
                    activity_count = log.get_activities(activity_key).len(),
                    "Log loaded and analyzed"
                );
                Ok(discover_simulated_annealing_from_log(
                    log,
                    activity_key,
                    temperature,
                    cooling_rate,
                ))
            }
            Some(_) => Err(crate::error::js_val("Not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let node_count = best_dfg.nodes.len();
    let edge_count = best_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.simulated_annealing",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        fitness = best_fitness,
        "DFG model optimized"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "simulated_annealing",
        "nodes": node_count,
        "edges": edge_count,
        "fitness": best_fitness,
    }))
}

/// Pure-Rust SA discovery: takes EventLog directly, returns (DFG, fitness).
/// Testable without wasm-bindgen runtime — same logic as discover_simulated_annealing.
pub fn discover_simulated_annealing_from_log(
    log: &EventLog,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> (DFG, f64) {
    use std::collections::BTreeSet as HS;

    if temperature <= 0.0 {
        return (DFG::new(), 0.0); // invalid temperature
    }
    if cooling_rate <= 0.0 || cooling_rate >= 1.0 || !cooling_rate.is_finite() {
        return (DFG::new(), 0.0); // cooling_rate must be in (0, 1)
    }

    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    // Pre-size with n²/4 capacity (sparse DFG heuristic) to avoid repeated rehashes.
    let n_vocab = col.vocab.len();
    let edge_cap = n_vocab.saturating_mul(n_vocab) / 4 + 1;
    let mut edge_vocab: Vec<(u32, u32)> = Vec::with_capacity(edge_cap);
    let mut edge_freq: FxHashMap<(u32, u32), f64> =
        FxHashMap::with_capacity_and_hasher(edge_cap, Default::default());
    let mut node_freq: FxHashMap<u32, usize> =
        FxHashMap::with_capacity_and_hasher(n_vocab + 1, Default::default());
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_default() += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_default();
                if *cnt == 0.0 {
                    edge_vocab.push(edge);
                }
                *cnt += 1.0;
            }
        }
    }
    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let vocab_len = edge_vocab.len();
    let cooling_rate = cooling_rate.clamp(0.001_f64, 0.9999_f64);
    // Fix (PR #54 SPC NaN class): temperature was unguarded — a caller passing NaN
    // skipped the entire loop (NaN > 0.01 is false) and the algorithm returned the
    // empty edge set; a caller passing Inf would run for ~∞ iterations until
    // cooling_rate exponential decay reached 0.01. Clamp into a finite, positive
    // working range.
    let temperature = if temperature.is_finite() && temperature > 0.0 {
        temperature.clamp(0.02_f64, 1.0e6_f64)
    } else {
        1.0_f64
    };
    let mut rng = StdRng::seed_from_u64(42);

    let mut current_edges: HS<(u32, u32)> = HS::new();
    let mut current_fitness = evaluate_edges_fitness(&current_edges, &col, vocab_len);
    let mut best_edges = current_edges.clone();
    let mut best_fitness = current_fitness;
    let mut temp = temperature;

    while temp > 0.01 {
        // Mutate current_edges in-place instead of cloning a full neighbour copy.
        // Track what was changed so we can undo it on rejection — O(1) allocation
        // instead of O(edges) per temperature step.
        enum Move {
            Removed((u32, u32)),
            Added((u32, u32)),
        }
        let mv: Option<Move> = if rng.gen::<f64>() < 0.5 && !current_edges.is_empty() {
            // BTreeSet iterates in ascending order — no explicit sort needed.
            let pick = (rng.gen::<f64>() * current_edges.len() as f64) as usize;
            let edge = *current_edges.iter().nth(pick).unwrap();
            current_edges.remove(&edge);
            Some(Move::Removed(edge))
        } else if !edge_vocab.is_empty() {
            let idx = (rng.gen::<f64>() * edge_vocab.len() as f64) as usize;
            let edge = edge_vocab[idx];
            current_edges.insert(edge);
            Some(Move::Added(edge))
        } else {
            None
        };

        let neighbor_fitness = evaluate_edges_fitness(&current_edges, &col, vocab_len);
        let delta = neighbor_fitness - current_fitness;
        // Fix (PR #54 SPC NaN class): if either fitness was NaN, `delta` is NaN and
        // `delta >= 0.0` is false; `(NaN/temp).exp()` is also NaN and `rng.gen() < NaN`
        // is false, so the branch was silently always-reject. Treat NaN delta as a
        // worst-case "do not accept" while still allowing the loop to terminate.
        let accept = if delta.is_nan() {
            false
        } else {
            delta >= 0.0 || rng.gen::<f64>() < (delta / temp).exp()
        };
        if accept {
            current_fitness = neighbor_fitness;
            if current_fitness > best_fitness {
                best_fitness = current_fitness;
                best_edges = current_edges.clone();
            }
        } else {
            // Undo the move: restore the single changed edge.
            match mv {
                Some(Move::Removed(e)) => {
                    current_edges.insert(e);
                }
                Some(Move::Added(e)) => {
                    current_edges.remove(&e);
                }
                None => {}
            }
        }
        temp *= cooling_rate;
    }
    (
        edge_set_to_dfg(&best_edges, &vocab, &edge_freq, &node_freq),
        best_fitness,
    )
}

/// Process Skeleton - extract minimal model structure
#[wasm_bindgen]
pub fn extract_process_skeleton(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_event_log(eventlog_handle, |log| {
        let activities = log.get_activities(activity_key);
        let directly_follows_vec = log.get_directly_follows(activity_key);

        let mut dfg = DFG::new();

        // Calculate activity frequencies and start/end activities
        let mut activity_freqs = rustc_hash::FxHashMap::default();
        let mut start_counts = rustc_hash::FxHashMap::default();
        let mut end_counts = rustc_hash::FxHashMap::default();

        for trace in &log.traces {
            let mut first = true;
            let mut last_event: Option<&String> = None;

            for event in &trace.events {
                if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                    *activity_freqs.entry(act.clone()).or_default() += 1;
                    if first {
                        *start_counts.entry(act.clone()).or_default() += 1;
                        first = false;
                    }
                    last_event = Some(act);
                }
            }

            if let Some(act) = last_event {
                *end_counts.entry(act.clone()).or_default() += 1;
            }
        }

        // Only include edges above frequency threshold
        for (from, to, freq) in &directly_follows_vec {
            if *freq >= min_frequency {
                dfg.edges.push(DirectlyFollowsRelation {
                    from: from.clone(),
                    to: to.clone(),
                    frequency: *freq,
                });
            }
        }

        // Remove nodes with no edges, but without allocating multiple strings in flat_map
        let mut nodes_with_edges: HashSet<&str> = HashSet::new();
        for e in &dfg.edges {
            nodes_with_edges.insert(&e.from);
            nodes_with_edges.insert(&e.to);
        }

        for activity in &activities {
            if nodes_with_edges.contains(activity.as_str()) {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: *activity_freqs.get(activity).unwrap_or(&0),
                });
            }
        }

        // Populate start and end activities for the DFG skeleton
        for (act, count) in start_counts {
            if nodes_with_edges.contains(act.as_str()) {
                dfg.start_activities.insert(act, count);
            }
        }
        for (act, count) in end_counts {
            if nodes_with_edges.contains(act.as_str()) {
                dfg.end_activities.insert(act, count);
            }
        }

        Ok(dfg)
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "process_skeleton",
        "nodes": dfg.nodes.len(),
        "edges": dfg.edges.len(),
        "min_frequency": min_frequency,
    }))
}

/// Activity Dependency Analysis - identify predecessor/successor relationships
#[wasm_bindgen]
pub fn analyze_activity_dependencies(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut predecessors: std::collections::BTreeMap<
            String,
            std::collections::BTreeSet<String>,
        > = std::collections::BTreeMap::new();
        let mut successors: std::collections::BTreeMap<String, std::collections::BTreeSet<String>> =
            std::collections::BTreeMap::new();

        for trace in &log.traces {
            for (i, event) in trace.events.iter().enumerate() {
                if let Some(AttributeValue::String(current)) = event.attributes.get(activity_key) {
                    // Get predecessors
                    if i > 0 {
                        if let Some(AttributeValue::String(prev)) =
                            trace.events[i - 1].attributes.get(activity_key)
                        {
                            predecessors
                                .entry(current.clone())
                                .or_default()
                                .insert(prev.clone());
                        }
                    }

                    // Get successors
                    if i < trace.events.len() - 1 {
                        if let Some(AttributeValue::String(next)) =
                            trace.events[i + 1].attributes.get(activity_key)
                        {
                            successors
                                .entry(current.clone())
                                .or_default()
                                .insert(next.clone());
                        }
                    }
                }
            }
        }

        let result: Vec<_> = predecessors
            .keys()
            .map(|activity| {
                json!({
                    "activity": activity,
                    "predecessors": predecessors.get(activity).map_or(0, |s| s.len()),
                    "successors": successors.get(activity).map_or(0, |s| s.len()),
                })
            })
            .collect();

        to_js_str(&json!({
            "dependencies": result,
        }))
    })
}

/// Case Attribute Analysis - correlate case attributes with process behavior
#[wasm_bindgen]
pub fn analyze_case_attributes(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let mut attribute_values: std::collections::BTreeMap<
            String,
            std::collections::BTreeSet<String>,
        > = std::collections::BTreeMap::new();
        let mut attribute_activity_map: FxHashMap<(String, String), Vec<String>> =
            FxHashMap::default();

        for trace in &log.traces {
            let activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get(activity_key)?
                        .as_string()
                        .map(str::to_owned)
                })
                .collect();

            for (key, value) in &trace.attributes {
                if let AttributeValue::String(v) = value {
                    attribute_values
                        .entry(key.clone())
                        .or_default()
                        .insert(v.clone());

                    attribute_activity_map
                        .entry((key.clone(), v.clone()))
                        .or_default()
                        .extend(activities.clone());
                }
            }
        }

        let result: Vec<_> = attribute_values
            .iter()
            .map(|(attr, values)| {
                json!({
                    "attribute": attr,
                    "unique_values": values.len(),
                    "examples": values.iter().take(5).collect::<Vec<_>>()
                })
            })
            .collect();

        to_js_str(&json!({
            "case_attributes": result,
        }))
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/// Fitness function: fraction of traces fully covered by the DFG edges.
/// Marked inline(always) so the compiler can specialise it at each call site
// Helper: Evaluate fitness of an edge set against columnar log (zero string allocation)
#[inline]
// Helper: Materialize a DFG from edge set and vocabulary
fn edge_set_to_dfg(
    edge_set: &BTreeSet<(u32, u32)>,
    vocab: &[String],
    edge_freq: &FxHashMap<(u32, u32), f64>,
    node_freq: &FxHashMap<u32, usize>,
) -> DFG {
    let mut dfg = DFG::new();

    for (idx, activity) in vocab.iter().enumerate() {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: node_freq.get(&(idx as u32)).copied().unwrap_or(0),
        });
    }

    for &(from_id, to_id) in edge_set {
        let from_idx = from_id as usize;
        let to_idx = to_id as usize;
        if from_idx < vocab.len() && to_idx < vocab.len() {
            let freq = edge_freq.get(&(from_id, to_id)).copied().unwrap_or(1.0) as usize;
            dfg.edges.push(DirectlyFollowsRelation {
                from: vocab[from_idx].clone(),
                to: vocab[to_idx].clone(),
                frequency: freq,
            });
        }
    }

    dfg
}

#[wasm_bindgen]
pub fn more_discovery_info() -> String {
    json!({
        "status": "more_discovery_available",
        "algorithms": [
            {"name": "inductive_miner", "type": "structured", "speed": "fast"},
            {"name": "ant_colony", "type": "metaheuristic", "speed": "medium"},
            {"name": "simulated_annealing", "type": "thermal_search", "speed": "medium"},
            {"name": "process_skeleton", "type": "filtering", "speed": "very_fast"},
            {"name": "activity_dependencies", "type": "analytics", "speed": "fast"},
            {"name": "case_attributes", "type": "analytics", "speed": "fast"},
        ]
    })
    .to_string()
}
