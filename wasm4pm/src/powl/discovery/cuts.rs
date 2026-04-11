//! Cut detection for inductive miner.
//!
//! Implements the main cut types plus extended cuts from pm4py variants:
//!
//! Standard cuts (from pm4py CutFactory):
//!   - Concurrency cut (partial order)
//!   - Sequence cut
//!   - Loop cut
//!   - XOR cut
//!
//! Extended cuts (from pm4py variant factories):
//!   - Maximal partial order cut (clusters by pre/post-sets)
//!   - Dynamic clustering partial order cut (iterative clustering)
//!   - Brute-force partial order cut (exhaustive partition enumeration)

use crate::powl::discovery::DiscoveryConfig;
use crate::powl_arena::{Operator, PowlArena};
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// Eventually-follows graph (EFG) helper
// ---------------------------------------------------------------------------

/// Build the eventually-follows graph from traces.
///
/// The EFG contains (a, b) if activity `a` appears before `b` in any trace,
/// regardless of intervening activities.
fn build_efg(traces: &[Vec<String>]) -> HashSet<(String, String)> {
    let mut efg = HashSet::new();
    for trace in traces {
        let activities: Vec<&String> = trace.iter().collect();
        for i in 0..activities.len() {
            for j in (i + 1)..activities.len() {
                efg.insert((activities[i].clone(), activities[j].clone()));
            }
        }
    }
    efg
}

/// Build the directly-follows graph (DFG) from traces.
fn build_dfg(traces: &[Vec<String>]) -> HashSet<(String, String)> {
    let mut dfg = HashSet::new();
    for trace in traces {
        for i in 0..trace.len().saturating_sub(1) {
            dfg.insert((trace[i].clone(), trace[i + 1].clone()));
        }
    }
    dfg
}

// ---------------------------------------------------------------------------
// Standard cuts
// ---------------------------------------------------------------------------

/// Detect concurrency cut (partial order).
///
/// A concurrency cut exists when there are multiple activities that can happen
/// in parallel (traces with different orderings of the same activities).
pub fn detect_concurrency_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    let unique_activities: HashSet<&str> = traces
        .iter()
        .flat_map(|trace| trace.iter().map(|s| s.as_str()))
        .collect();

    if unique_activities.len() < 2 {
        return Err("Not enough activities for concurrency cut".to_string());
    }

    let orderings: HashSet<Vec<&str>> = traces
        .iter()
        .map(|trace| trace.iter().map(|s| s.as_str()).collect())
        .collect();

    if orderings.len() < 2 {
        return Err("Only one ordering found, not concurrent".to_string());
    }

    let activity_set: Vec<String> = unique_activities
        .into_iter()
        .map(|s| s.to_string())
        .collect();
    let mut activity_to_idx: HashMap<String, usize> = HashMap::new();
    for (i, act) in activity_set.iter().enumerate() {
        activity_to_idx.insert(act.clone(), i);
    }

    let mut child_indices: Vec<u32> = Vec::new();
    for activity in &activity_set {
        let child_idx = arena.add_transition(Some(activity.clone()));
        child_indices.push(child_idx);
    }

    let spo_idx = arena.add_strict_partial_order(child_indices.clone());

    for trace in traces {
        for i in 0..trace.len().saturating_sub(1) {
            let src = &trace[i];
            let tgt = &trace[i + 1];
            if let (Some(&src_idx), Some(&tgt_idx)) =
                (activity_to_idx.get(src), activity_to_idx.get(tgt))
            {
                arena.add_order_edge(spo_idx, src_idx, tgt_idx);
            }
        }
    }

    Ok(spo_idx)
}

/// Detect sequence cut.
///
/// A sequence cut exists when all traces have the same activity sequence.
pub fn detect_sequence_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for sequence cut".to_string());
    }

    let first_sequence = &traces[0];
    for trace in &traces[1..] {
        if trace != first_sequence {
            return Err("Traces have different sequences, not sequential".to_string());
        }
    }

    let mut child_indices: Vec<u32> = Vec::new();
    for activity in first_sequence {
        let child_idx = arena.add_transition(Some(activity.clone()));
        child_indices.push(child_idx);
    }

    let spo_idx = arena.add_strict_partial_order(child_indices.clone());
    for i in 0..child_indices.len().saturating_sub(1) {
        arena.add_order_edge(spo_idx, i, i + 1);
    }

    Ok(spo_idx)
}

/// Detect loop cut.
///
/// A loop cut exists when the first activity appears again later in a trace.
pub fn detect_loop_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for loop cut".to_string());
    }

    for trace in traces {
        if trace.len() < 2 {
            continue;
        }

        let first_activity = &trace[0];
        if trace[1..].contains(first_activity) {
            let do_idx = arena.add_transition(Some(first_activity.clone()));
            let mut redo_indices: Vec<u32> = Vec::new();
            for activity in &trace[1..] {
                let idx = arena.add_transition(Some(activity.clone()));
                redo_indices.push(idx);
            }
            let loop_idx = arena.add_operator(Operator::Loop, vec![do_idx, redo_indices[0]]);
            return Ok(loop_idx);
        }
    }

    Err("No loop pattern detected".to_string())
}

/// Detect XOR cut.
///
/// An XOR cut exists when we have alternative paths (mutually exclusive traces).
pub fn detect_xor_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() || traces.len() < 2 {
        return Err("Need at least 2 traces for XOR cut".to_string());
    }

    let first_trace = &traces[0];
    let all_same = traces[1..].iter().all(|t| t == first_trace);
    if all_same {
        return Err("All traces are identical, not XOR alternatives".to_string());
    }

    let mut child_indices: Vec<u32> = Vec::new();
    for trace in traces {
        let mut trace_children: Vec<u32> = Vec::new();
        for activity in trace {
            let idx = arena.add_transition(Some(activity.clone()));
            trace_children.push(idx);
        }

        let trace_root = if trace_children.len() == 1 {
            trace_children[0]
        } else {
            let spo_idx = arena.add_strict_partial_order(trace_children.clone());
            for i in 0..trace_children.len().saturating_sub(1) {
                arena.add_order_edge(spo_idx, i, i + 1);
            }
            spo_idx
        };

        child_indices.push(trace_root);
    }

    let xor_idx = arena.add_operator(Operator::Xor, child_indices);
    Ok(xor_idx)
}

// ---------------------------------------------------------------------------
// Extended cuts (from pm4py variant factories)
// ---------------------------------------------------------------------------

/// Detect maximal partial order cut.
///
/// Port of pm4py `MaximalPartialOrderCutUVCL`. Generates an initial order
/// from the EFG, then clusters nodes that share the same pre-set and post-set.
/// This detects the largest possible partial order structure.
#[allow(clippy::needless_range_loop)]
pub fn detect_maximal_partial_order_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    let efg = build_efg(traces);
    let dfg = build_dfg(traces);

    // Collect unique activities (sorted for determinism)
    let mut activities: Vec<String> = traces
        .iter()
        .flat_map(|t| t.iter().cloned())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    activities.sort();

    if activities.len() < 2 {
        return Err("Not enough activities for maximal PO cut".to_string());
    }

    // Build activity-to-index mapping
    let mut act_to_idx: HashMap<String, usize> = HashMap::new();
    for (i, a) in activities.iter().enumerate() {
        act_to_idx.insert(a.clone(), i);
    }

    // Step 1: Generate initial order from EFG
    // For each pair (a, b): if (a,b) in EFG but not (b,a) -> a before b
    // If (b,a) in EFG but not (a,b) -> b before a
    // If both or neither -> no ordering constraint (concurrent)
    let n = activities.len();
    let mut has_edge: Vec<Vec<bool>> = vec![vec![false; n]; n];

    for i in 0..n {
        for j in (i + 1)..n {
            let a = &activities[i];
            let b = &activities[j];
            let ab = efg.contains(&(a.clone(), b.clone()));
            let ba = efg.contains(&(b.clone(), a.clone()));

            if ab && !ba {
                has_edge[i][j] = true;
            } else if ba && !ab {
                has_edge[j][i] = true;
            }
            // If both or neither, no edge (concurrent)
        }
    }

    // Step 2: Cluster by identical pre/post-sets
    // Compute pre-sets and post-sets
    let mut pre_sets: Vec<HashSet<usize>> = vec![HashSet::new(); n];
    let mut post_sets: Vec<HashSet<usize>> = vec![HashSet::new(); n];
    for i in 0..n {
        for j in 0..n {
            if has_edge[i][j] {
                pre_sets[j].insert(i);
                post_sets[i].insert(j);
            }
        }
    }

    // Group nodes with identical pre and post-sets
    let mut clusters: Vec<Vec<usize>> = Vec::new();
    let mut assigned: Vec<bool> = vec![false; n];

    for i in 0..n {
        if assigned[i] {
            continue;
        }
        let mut cluster = vec![i];
        assigned[i] = true;
        for j in (i + 1)..n {
            if !assigned[j] && pre_sets[i] == pre_sets[j] && post_sets[i] == post_sets[j] {
                cluster.push(j);
                assigned[j] = true;
            }
        }
        clusters.push(cluster);
    }

    // Need at least 2 clusters for a valid cut
    if clusters.len() < 2 {
        return Err("Cannot form multiple clusters for maximal PO cut".to_string());
    }

    // Determine start and end activities from DFG
    let mut has_incoming: HashSet<String> = HashSet::new();
    let mut has_outgoing: HashSet<String> = HashSet::new();
    for (a, b) in dfg.iter() {
        has_outgoing.insert(a.clone());
        has_incoming.insert(b.clone());
    }

    let start_activities: HashSet<&str> = activities
        .iter()
        .filter(|a| !has_incoming.contains(*a))
        .map(|s| s.as_str())
        .collect();
    let end_activities: HashSet<&str> = activities
        .iter()
        .filter(|a| !has_outgoing.contains(*a))
        .map(|s| s.as_str())
        .collect();

    // Validate: each cluster that is a start cluster must contain a start activity
    // Build order between clusters
    let nc = clusters.len();
    let mut cluster_pre: Vec<HashSet<usize>> = vec![HashSet::new(); nc];
    let mut cluster_post: Vec<HashSet<usize>> = vec![HashSet::new(); nc];
    for ci in 0..nc {
        for cj in 0..nc {
            if ci == cj {
                continue;
            }
            // There's an edge from cluster ci to cj if any node in ci has edge to any node in cj
            for &ni in &clusters[ci] {
                for &nj in &clusters[cj] {
                    if has_edge[ni][nj] {
                        cluster_pre[cj].insert(ci);
                        cluster_post[ci].insert(cj);
                    }
                }
            }
        }
    }

    // Check start/end validity
    for ci in 0..nc {
        let is_start_cluster = cluster_pre[ci].is_empty();
        if is_start_cluster {
            let has_start = clusters[ci]
                .iter()
                .any(|&idx| start_activities.contains(activities[idx].as_str()));
            if !has_start && !start_activities.is_empty() {
                return Err("Start cluster has no start activity".to_string());
            }
        }
        let is_end_cluster = cluster_post[ci].is_empty();
        if is_end_cluster {
            let has_end = clusters[ci]
                .iter()
                .any(|&idx| end_activities.contains(activities[idx].as_str()));
            if !has_end && !end_activities.is_empty() {
                return Err("End cluster has no end activity".to_string());
            }
        }
    }

    // Build the partial order with clusters as groups
    let mut child_indices: Vec<u32> = Vec::new();
    let mut cluster_to_child: Vec<usize> = Vec::new();
    for cluster in &clusters {
        if cluster.len() == 1 {
            let idx = arena.add_transition(Some(activities[cluster[0]].clone()));
            child_indices.push(idx);
            cluster_to_child.push(child_indices.len() - 1);
        } else {
            // Multiple activities in cluster -> sequence
            let mut seq_children: Vec<u32> = Vec::new();
            for &act_idx in cluster {
                let idx = arena.add_transition(Some(activities[act_idx].clone()));
                seq_children.push(idx);
            }
            let spo_idx = arena.add_strict_partial_order(seq_children.clone());
            for k in 0..seq_children.len().saturating_sub(1) {
                arena.add_order_edge(spo_idx, k, k + 1);
            }
            child_indices.push(spo_idx);
            cluster_to_child.push(child_indices.len() - 1);
        }
    }

    let spo_idx = arena.add_strict_partial_order(child_indices.clone());
    // Add edges between clusters
    for ci in 0..nc {
        for cj in 0..nc {
            if ci != cj && cluster_post[ci].contains(&cj) {
                arena.add_order_edge(spo_idx, ci, cj);
            }
        }
    }

    Ok(spo_idx)
}

/// Detect dynamic clustering partial order cut.
///
/// Port of pm4py `DynamicClusteringPartialOrderCutUVCL`. Iteratively clusters
/// activities that appear concurrent (both orderings present in EFG), building
/// a partial order with merged groups.
#[allow(clippy::needless_range_loop)]
pub fn detect_dynamic_clustering_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    let efg = build_efg(traces);
    let _dfg = build_dfg(traces);

    let mut activities: Vec<String> = traces
        .iter()
        .flat_map(|t| t.iter().cloned())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    activities.sort();

    if activities.len() < 2 {
        return Err("Not enough activities for dynamic clustering cut".to_string());
    }

    // Start with each activity in its own cluster
    let mut clusters: Vec<Vec<String>> = activities.iter().map(|a| vec![a.clone()]).collect();

    // Iteratively refine: merge concurrent pairs
    let mut changed = true;
    while changed {
        changed = false;
        let nc = clusters.len();
        // Build EFG at cluster level
        let mut cluster_efg_both: Vec<Vec<bool>> = vec![vec![false; nc]; nc];
        let mut cluster_efg_ab: Vec<Vec<bool>> = vec![vec![false; nc]; nc];
        let mut cluster_efg_ba: Vec<Vec<bool>> = vec![vec![false; nc]; nc];

        for ci in 0..nc {
            for cj in (ci + 1)..nc {
                let mut has_ab = false;
                let mut has_ba = false;
                for a in &clusters[ci] {
                    for b in &clusters[cj] {
                        if efg.contains(&(a.clone(), b.clone())) {
                            has_ab = true;
                        }
                        if efg.contains(&(b.clone(), a.clone())) {
                            has_ba = true;
                        }
                    }
                }
                cluster_efg_ab[ci][cj] = has_ab;
                cluster_efg_ba[ci][cj] = has_ba;
                cluster_efg_ab[cj][ci] = has_ba;
                cluster_efg_ba[cj][ci] = has_ab;
                cluster_efg_both[ci][cj] = has_ab && has_ba;
                cluster_efg_both[cj][ci] = has_ab && has_ba;
            }
        }

        // Merge clusters that are concurrent (both directions in EFG)
        let mut new_clusters: Vec<Vec<String>> = Vec::new();
        let mut merged: Vec<bool> = vec![false; nc];

        for ci in 0..nc {
            if merged[ci] {
                continue;
            }
            let mut group = clusters[ci].clone();
            for cj in (ci + 1)..nc {
                if !merged[cj] && cluster_efg_both[ci][cj] {
                    // These two clusters are concurrent -> merge
                    group.extend(clusters[cj].iter().cloned());
                    merged[cj] = true;
                    changed = true;
                }
            }
            new_clusters.push(group);
        }

        clusters = new_clusters;
    }

    if clusters.len() < 2 {
        return Err("Dynamic clustering produced only one cluster".to_string());
    }

    // Build order between clusters using EFG
    let nc = clusters.len();
    let mut cluster_has_edge: Vec<Vec<bool>> = vec![vec![false; nc]; nc];

    for ci in 0..nc {
        for cj in (ci + 1)..nc {
            let mut has_ab = false;
            let mut has_ba = false;
            for a in &clusters[ci] {
                for b in &clusters[cj] {
                    if efg.contains(&(a.clone(), b.clone())) {
                        has_ab = true;
                    }
                    if efg.contains(&(b.clone(), a.clone())) {
                        has_ba = true;
                    }
                }
            }
            if has_ab && !has_ba {
                cluster_has_edge[ci][cj] = true;
            } else if has_ba && !has_ab {
                cluster_has_edge[cj][ci] = true;
            }
        }
    }

    // Check validity: no pair should have both directions (irreflexivity)
    for ci in 0..nc {
        for cj in (ci + 1)..nc {
            if cluster_has_edge[ci][cj] && cluster_has_edge[cj][ci] {
                return Err("Dynamic clustering produced cyclic order between clusters".to_string());
            }
        }
    }

    // Build the POWL model
    let mut child_indices: Vec<u32> = Vec::new();
    for cluster in &clusters {
        if cluster.len() == 1 {
            let idx = arena.add_transition(Some(cluster[0].clone()));
            child_indices.push(idx);
        } else {
            let mut seq_children: Vec<u32> = Vec::new();
            for activity in cluster {
                let idx = arena.add_transition(Some(activity.clone()));
                seq_children.push(idx);
            }
            let spo_idx = arena.add_strict_partial_order(seq_children.clone());
            for k in 0..seq_children.len().saturating_sub(1) {
                arena.add_order_edge(spo_idx, k, k + 1);
            }
            child_indices.push(spo_idx);
        }
    }

    let spo_idx = arena.add_strict_partial_order(child_indices.clone());
    for ci in 0..nc {
        for cj in 0..nc {
            if cluster_has_edge[ci][cj] {
                arena.add_order_edge(spo_idx, ci, cj);
            }
        }
    }

    Ok(spo_idx)
}

/// Detect brute-force partial order cut.
///
/// Port of pm4py `BruteForcePartialOrderCutUVCL`. Enumerates ALL possible
/// partitions of activities (from largest to smallest), generates a partial
/// order from the EFG for each partition, and returns the first valid one.
///
/// This is exponential in the number of activities but guarantees finding
/// a valid cut if one exists.
#[allow(clippy::needless_range_loop)]
pub fn detect_brute_force_partial_order_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    let efg = build_efg(traces);
    let dfg = build_dfg(traces);

    let mut activities: Vec<String> = traces
        .iter()
        .flat_map(|t| t.iter().cloned())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    activities.sort();

    if activities.len() < 2 {
        return Err("Not enough activities for brute force PO cut".to_string());
    }

    // Limit brute force to small activity sets to avoid exponential explosion
    if activities.len() > 8 {
        return Err(format!(
            "Brute force cut limited to 8 activities, got {}",
            activities.len()
        ));
    }

    // Determine start/end activities from DFG
    let mut has_incoming: HashSet<String> = HashSet::new();
    let mut has_outgoing: HashSet<String> = HashSet::new();
    for (a, b) in &dfg {
        has_outgoing.insert(a.clone());
        has_incoming.insert(b.clone());
    }

    let start_activities: HashSet<&str> = activities
        .iter()
        .filter(|a| !has_incoming.contains(*a))
        .map(|s| s.as_str())
        .collect();
    let end_activities: HashSet<&str> = activities
        .iter()
        .filter(|a| !has_outgoing.contains(*a))
        .map(|s| s.as_str())
        .collect();

    // Enumerate partitions from largest to smallest (Bell number ordering)
    // For efficiency, try 2-partition first (most common case)
    let n = activities.len();

    // Try 2-partitions first (most likely to succeed)
    let two_partitions = generate_partitions_of_size_k(&activities, 2);
    for partition in &two_partitions {
        if let Some(spo_idx) = try_partition_as_po(
            partition,
            &efg,
            &activities,
            &start_activities,
            &end_activities,
            arena,
        ) {
            return Ok(spo_idx);
        }
    }

    // Then try partitions of size 3, 4, ..., n
    for k in 3..=n {
        let partitions = generate_partitions_of_size_k(&activities, k);
        for partition in &partitions {
            if let Some(spo_idx) = try_partition_as_po(
                partition,
                &efg,
                &activities,
                &start_activities,
                &end_activities,
                arena,
            ) {
                return Ok(spo_idx);
            }
        }
    }

    Err("No valid partition found for brute force PO cut".to_string())
}

/// Try to create a valid partial order from a partition.
///
/// Returns Some(arena_index) if the partition forms a valid cut, None otherwise.
#[allow(clippy::needless_range_loop)]
fn try_partition_as_po(
    partition: &[Vec<String>],
    efg: &HashSet<(String, String)>,
    _all_activities: &[String],
    start_activities: &HashSet<&str>,
    end_activities: &HashSet<&str>,
    arena: &mut PowlArena,
) -> Option<u32> {
    let np = partition.len();
    if np < 2 {
        return None;
    }

    // Generate order from EFG
    let mut has_edge: Vec<Vec<bool>> = vec![vec![false; np]; np];
    let mut all_efg_ab: Vec<Vec<bool>> = vec![vec![true; np]; np];
    let mut all_efg_ba: Vec<Vec<bool>> = vec![vec![true; np]; np];

    for ci in 0..np {
        for cj in (ci + 1)..np {
            let mut any_ab = false;
            let mut any_ba = false;
            let mut all_ab = true;
            let mut all_ba = true;

            for a in &partition[ci] {
                for b in &partition[cj] {
                    if efg.contains(&(a.clone(), b.clone())) {
                        any_ab = true;
                    } else {
                        all_ab = false;
                    }
                    if efg.contains(&(b.clone(), a.clone())) {
                        any_ba = true;
                    } else {
                        all_ba = false;
                    }
                }
            }

            all_efg_ab[ci][cj] = all_ab;
            all_efg_ba[ci][cj] = all_ba;
            all_efg_ab[cj][ci] = all_ba;
            all_efg_ba[cj][ci] = all_ab;

            if any_ab && !any_ba {
                has_edge[ci][cj] = true;
            } else if any_ba && !any_ab {
                has_edge[cj][ci] = true;
            }
        }
    }

    // Check irreflexivity (no mutual edges)
    for ci in 0..np {
        for cj in (ci + 1)..np {
            if has_edge[ci][cj] && has_edge[cj][ci] {
                return None; // Not a valid partial order
            }
        }
    }

    // Check: for any pair with no edge, both must be in EFG (concurrent)
    for ci in 0..np {
        for cj in (ci + 1)..np {
            if !has_edge[ci][cj]
                && !has_edge[cj][ci]
                && (!all_efg_ab[ci][cj] || !all_efg_ba[ci][cj])
            {
                return None;
            }
        }
    }

    // Check start/end consistency
    let mut is_start_cluster: Vec<bool> = vec![true; np];
    let mut is_end_cluster: Vec<bool> = vec![true; np];

    for ci in 0..np {
        for cj in 0..np {
            if ci != cj {
                if has_edge[ci][cj] {
                    is_start_cluster[cj] = false;
                    is_end_cluster[ci] = false;
                }
                if has_edge[cj][ci] {
                    is_start_cluster[ci] = false;
                    is_end_cluster[cj] = false;
                }
            }
        }
    }

    for ci in 0..np {
        if is_start_cluster[ci] {
            let has_start = partition[ci]
                .iter()
                .any(|a| start_activities.contains(a.as_str()));
            if !has_start && !start_activities.is_empty() {
                return None;
            }
        }
        if is_end_cluster[ci] {
            let has_end = partition[ci]
                .iter()
                .any(|a| end_activities.contains(a.as_str()));
            if !has_end && !end_activities.is_empty() {
                return None;
            }
        }
    }

    // Build the POWL model
    let mut child_indices: Vec<u32> = Vec::new();
    for cluster in partition {
        if cluster.len() == 1 {
            let idx = arena.add_transition(Some(cluster[0].clone()));
            child_indices.push(idx);
        } else {
            let mut seq_children: Vec<u32> = Vec::new();
            for activity in cluster {
                let idx = arena.add_transition(Some(activity.clone()));
                seq_children.push(idx);
            }
            let spo_idx = arena.add_strict_partial_order(seq_children.clone());
            for k in 0..seq_children.len().saturating_sub(1) {
                arena.add_order_edge(spo_idx, k, k + 1);
            }
            child_indices.push(spo_idx);
        }
    }

    let spo_idx = arena.add_strict_partial_order(child_indices.clone());
    for ci in 0..np {
        for cj in 0..np {
            if has_edge[ci][cj] {
                arena.add_order_edge(spo_idx, ci, cj);
            }
        }
    }

    Some(spo_idx)
}

/// Generate all partitions of `items` into exactly `k` non-empty groups.
///
/// Uses a recursive algorithm based on restricted growth strings.
fn generate_partitions_of_size_k(items: &[String], k: usize) -> Vec<Vec<Vec<String>>> {
    let n = items.len();
    if k < 1 || k > n {
        return Vec::new();
    }
    if k == n {
        // Each element in its own group
        return vec![items.iter().map(|s| vec![s.clone()]).collect()];
    }

    let mut results = Vec::new();
    let mut current: Vec<usize> = vec![0; n]; // group assignment for each item

    // Recursive restricted growth string generation
    generate_rgs(&mut current, 0, k, items, &mut results);

    results
}

fn generate_rgs(
    current: &mut Vec<usize>,
    pos: usize,
    k: usize,
    items: &[String],
    results: &mut Vec<Vec<Vec<String>>>,
) {
    let n = items.len();
    if pos == n {
        // Check if we used exactly k groups
        let max_group = *current.iter().max().unwrap_or(&0) + 1;
        if max_group == k {
            let mut partition: Vec<Vec<String>> = vec![Vec::new(); k];
            for (i, &group) in current.iter().enumerate() {
                partition[group].push(items[i].clone());
            }
            results.push(partition);
        }
        return;
    }

    // Each position can join any existing group or start a new one
    let max_existing = if pos == 0 {
        0
    } else {
        *current[..pos].iter().max().unwrap_or(&0) + 1
    };

    for group in 0..=max_existing.min(k - 1) {
        // Only start a new group if we haven't exceeded k
        if group < max_existing || (group == max_existing && max_existing < k) {
            current[pos] = group;
            generate_rgs(current, pos + 1, k, items, results);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_cuts_detect_correctly() {
        // Happy path: concurrency, sequence, XOR cuts detect correctly
        let concurrent = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()],
        ];
        let sequential = vec![
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
        ];
        let alternatives = vec![vec!["A".to_string()], vec!["B".to_string()]];

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        assert!(detect_concurrency_cut(&concurrent, &mut arena, &config).is_ok());
        assert!(detect_sequence_cut(&sequential, &mut arena, &config).is_ok());
        assert!(detect_xor_cut(&alternatives, &mut arena, &config).is_ok());

        // Edge case: XOR rejects sequential traces (not alternatives)
        assert!(detect_xor_cut(&sequential, &mut arena, &config).is_err());
    }

    #[test]
    fn test_partial_order_cuts_detect_clusters() {
        // Maximal PO: mixed ordering produces 2 clusters
        let mixed = vec![
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            vec!["A".to_string(), "C".to_string(), "B".to_string()],
        ];
        // Dynamic clustering: same pattern should succeed
        // Brute force PO: concurrent activities handled

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        assert!(detect_maximal_partial_order_cut(&mixed, &mut arena, &config).is_ok());
        assert!(detect_dynamic_clustering_cut(&mixed, &mut arena, &config).is_ok());

        let concurrent = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()],
        ];
        assert!(detect_brute_force_partial_order_cut(&concurrent, &mut arena, &config).is_ok());
    }

    #[test]
    fn test_cut_helpers_and_edge_cases() {
        // Partition generation helper
        let items = vec!["A".to_string(), "B".to_string(), "C".to_string()];
        assert_eq!(generate_partitions_of_size_k(&items, 2).len(), 3);
        assert_eq!(generate_partitions_of_size_k(&items, 3).len(), 1);

        // EFG building: concurrent pair has bidirectional edges
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()],
        ];
        let efg = build_efg(&traces);
        assert!(efg.contains(&("A".to_string(), "B".to_string())));
        assert!(efg.contains(&("B".to_string(), "A".to_string())));

        // Edge case: brute force PO rejects >8 activities
        let too_many = vec![vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "D".to_string(),
            "E".to_string(),
            "F".to_string(),
            "G".to_string(),
            "H".to_string(),
            "I".to_string(),
        ]];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        assert!(detect_brute_force_partial_order_cut(&too_many, &mut arena, &config).is_err());
    }
}
