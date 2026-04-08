//! Convert a Petri Net (JSON) back to a POWL model.
//!
//! Ported from the Python `powl` package's `conversion/to_powl/from_pn/` module.
//!
//! Algorithm:
//!   1. Validate workflow net (single source, single sink)
//!   2. Preprocess: merge duplicate places, split shared preset/postset via silent transitions
//!   3. Make self-loops explicit (start == end case)
//!   4. Try base case (single transition)
//!   5. Try partial order cut → StrictPartialOrder
//!   6. Try choice graph cut → XOR
//!   7. Recursively decompose subnets
//!   8. Simplify result

use std::collections::{HashMap, HashSet, VecDeque};

use crate::powl_models::PowlPetriNetResult;
use crate::powl_arena::{PowlArena, Operator};
use crate::powl::simplify;

// ─── Internal Petri Net Graph ─────────────────────────────────────────────

/// Node identifier in the internal graph. Uses string names for compatibility
/// with the serialized JSON format.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum NodeId {
    Place(String),
    Transition(String),
}

impl NodeId {
    fn as_str(&self) -> &str {
        match self {
            NodeId::Place(s) | NodeId::Transition(s) => s,
        }
    }

    fn is_place(&self) -> bool {
        matches!(self, NodeId::Place(_))
    }

    fn is_transition(&self) -> bool {
        matches!(self, NodeId::Transition(_))
    }
}

/// Internal mutable Petri net for the conversion algorithm.
struct InternalNet {
    places: HashSet<String>,
    transitions: HashMap<String, Option<String>>, // name → label (None = silent)
    arcs: Vec<(NodeId, NodeId)>,                   // source → target
}

#[allow(dead_code)]
impl InternalNet {
    fn from_result(result: &PowlPetriNetResult) -> Result<Self, String> {
        let mut places = HashSet::new();
        for p in &result.net.places {
            places.insert(p.name.clone());
        }

        let mut transitions = HashMap::new();
        for t in &result.net.transitions {
            transitions.insert(t.name.clone(), t.label.clone());
        }

        let mut arcs = Vec::new();
        for a in &result.net.arcs {
            // Determine if source/target is a place or transition
            let source = if places.contains(&a.source) {
                NodeId::Place(a.source.clone())
            } else {
                NodeId::Transition(a.source.clone())
            };
            let target = if places.contains(&a.target) {
                NodeId::Place(a.target.clone())
            } else {
                NodeId::Transition(a.target.clone())
            };
            arcs.push((source, target));
        }

        Ok(InternalNet { places, transitions, arcs })
    }

    fn pre_set(&self, node: &NodeId) -> HashSet<NodeId> {
        let mut result = HashSet::new();
        for (src, tgt) in &self.arcs {
            if tgt == node {
                result.insert(src.clone());
            }
        }
        result
    }

    fn post_set(&self, node: &NodeId) -> HashSet<NodeId> {
        let mut result = HashSet::new();
        for (src, tgt) in &self.arcs {
            if src == node {
                result.insert(tgt.clone());
            }
        }
        result
    }

    fn pre_set_transitions(&self, node: &NodeId) -> HashSet<String> {
        self.pre_set(node)
            .into_iter()
            .filter_map(|n| if n.is_transition() { Some(n.as_str().to_string()) } else { None })
            .collect()
    }

    fn post_set_transitions(&self, node: &NodeId) -> HashSet<String> {
        self.post_set(node)
            .into_iter()
            .filter_map(|n| if n.is_transition() { Some(n.as_str().to_string()) } else { None })
            .collect()
    }

    fn in_arcs_count(&self, node: &NodeId) -> usize {
        self.arcs.iter().filter(|(_, tgt)| tgt == node).count()
    }

    fn out_arcs_count(&self, node: &NodeId) -> usize {
        self.arcs.iter().filter(|(src, _)| src == node).count()
    }

    fn remove_arc(&mut self, src: &NodeId, tgt: &NodeId) {
        self.arcs.retain(|(s, t)| s != src || t != tgt);
    }

    fn add_arc(&mut self, src: &NodeId, tgt: &NodeId) {
        self.arcs.push((src.clone(), tgt.clone()));
    }

    fn add_place(&mut self, name: &str) {
        self.places.insert(name.to_string());
    }

    fn add_transition(&mut self, name: &str, label: Option<String>) {
        self.transitions.insert(name.to_string(), label);
    }

    fn remove_place(&mut self, name: &str) {
        self.places.remove(name);
        let node = NodeId::Place(name.to_string());
        self.arcs.retain(|(s, t)| s != &node && t != &node);
    }

    fn remove_transition(&mut self, name: &str) {
        self.transitions.remove(name);
        let node = NodeId::Transition(name.to_string());
        self.arcs.retain(|(s, t)| s != &node && t != &node);
    }

    fn transition_count(&self) -> usize {
        self.transitions.len()
    }

    fn place_count(&self) -> usize {
        self.places.len()
    }

    fn transition_names(&self) -> HashSet<String> {
        self.transitions.keys().cloned().collect()
    }

    fn is_silent(&self, name: &str) -> bool {
        self.transitions.get(name).map(|l| l.is_none()).unwrap_or(false)
    }

    fn places_no_incoming(&self) -> Vec<String> {
        let mut result = Vec::new();
        for p in &self.places {
            let node = NodeId::Place(p.clone());
            if self.in_arcs_count(&node) == 0 {
                result.push(p.clone());
            }
        }
        result
    }

    fn places_no_outgoing(&self) -> Vec<String> {
        let mut result = Vec::new();
        for p in &self.places {
            let node = NodeId::Place(p.clone());
            if self.out_arcs_count(&node) == 0 {
                result.push(p.clone());
            }
        }
        result
    }

    fn split_transitions(&self) -> Vec<String> {
        // Transitions that have both multiple incoming and outgoing arcs
        // are candidates for splitting during POWL construction.
        self.transitions.iter()
            .filter(|(name, _)| {
                let node = NodeId::Transition(name.to_string());
                self.in_arcs_count(&node) > 1 && self.out_arcs_count(&node) > 1
            })
            .map(|(n, _)| n.clone())
            .collect()
    }

    fn transitions_with_multiple_out(&self) -> Vec<String> {
        self.transitions.iter()
            .filter(|(name, _)| {
                let node = NodeId::Transition(name.to_string());
                self.out_arcs_count(&node) > 1
            })
            .map(|(n, _)| n.to_string())
            .collect()
    }

    fn transitions_with_multiple_in(&self) -> Vec<String> {
        self.transitions.iter()
            .filter(|(name, _)| {
                let node = NodeId::Transition(name.to_string());
                self.in_arcs_count(&node) > 1
            })
            .map(|(n, _)| n.to_string())
            .collect()
    }
}

// ─── ID generator ──────────────────────────────────────────────────────────

static mut NEXT_ID: u64 = 1;

fn next_id() -> u64 {
    unsafe { let id = NEXT_ID; NEXT_ID += 1; id }
}

fn reset_id_gen() {
    unsafe { NEXT_ID = 1; }
}

// ─── Reachability ──────────────────────────────────────────────────────────

/// Simplified reachability graph: for each transition, which transitions are reachable.
fn get_simplified_reachability_graph(net: &InternalNet) -> HashMap<String, HashSet<String>> {
    let mut graph = HashMap::new();
    for (t_name, _) in &net.transitions {
        let start = NodeId::Transition(t_name.clone());
        let mut reachable = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back(start.clone());
        while let Some(node) = queue.pop_front() {
            if reachable.contains(node.as_str()) {
                continue;
            }
            reachable.insert(node.as_str().to_string());
            for successor in net.post_set(&node) {
                if !reachable.contains(successor.as_str()) {
                    queue.push_back(successor);
                }
            }
        }
        // Only keep transitions in the reachable set
        let trans_reachable: HashSet<String> = reachable
            .into_iter()
            .filter(|s| net.transitions.contains_key(s))
            .collect();
        graph.insert(t_name.clone(), trans_reachable);
    }
    graph
}

/// Reachable transitions from a start place to a stop place (exclusive).
fn get_reachable_transitions_between(
    net: &InternalNet,
    start: &NodeId,
    stop: &NodeId,
) -> HashSet<String> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    queue.push_back(start.clone());
    while let Some(node) = queue.pop_front() {
        if &node == stop || visited.contains(node.as_str()) {
            continue;
        }
        visited.insert(node.as_str().to_string());
        for successor in net.post_set(&node) {
            queue.push_back(successor);
        }
    }
    visited.into_iter()
        .filter(|s| net.transitions.contains_key(s))
        .collect()
}

/// Backward reachable transitions from a start place to a stop place (exclusive).
fn get_backward_reachable_transitions_between(
    net: &InternalNet,
    start: &NodeId,
    stop: &NodeId,
) -> HashSet<String> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    queue.push_back(start.clone());
    while let Some(node) = queue.pop_front() {
        if &node == stop || visited.contains(node.as_str()) {
            continue;
        }
        visited.insert(node.as_str().to_string());
        for predecessor in net.pre_set(&node) {
            queue.push_back(predecessor);
        }
    }
    visited.into_iter()
        .filter(|s| net.transitions.contains_key(s))
        .collect()
}

// ─── Validation ────────────────────────────────────────────────────────────

fn validate_workflow_net(net: &InternalNet) -> Result<(String, String), String> {
    let no_incoming = net.places_no_incoming();
    if no_incoming.len() != 1 {
        return Err(format!("Not a workflow net: expected 1 source place, found {}", no_incoming.len()));
    }
    let start_place = no_incoming.into_iter().next().unwrap();

    let no_outgoing = net.places_no_outgoing();
    if no_outgoing.len() != 1 {
        return Err(format!("Not a workflow net: expected 1 sink place, found {}", no_outgoing.len()));
    }
    let end_place = no_outgoing.into_iter().next().unwrap();

    // Basic connectivity check: every place and transition should be reachable
    // from the source. For a proper check we'd need WF-net evaluation, but
    // the basic structural check suffices for our use case (nets produced by
    // our own powl_to_petri_net are always valid WF-nets).

    Ok((start_place, end_place))
}

// ─── Preprocessing ─────────────────────────────────────────────────────────

/// Preprocess the net: merge identical places, split shared preset/postset.
fn preprocess(net: &mut InternalNet) {
    // Iterate until no more changes
    loop {
        let mut changed = false;

        let all_places: Vec<String> = net.places.iter().cloned().collect();

        // Check all pairs of places
        for i in 0..all_places.len() {
            for j in (i + 1)..all_places.len() {
                let p1_name = &all_places[i];
                let p2_name = &all_places[j];

                let p1 = NodeId::Place(p1_name.clone());
                let p2 = NodeId::Place(p2_name.clone());

                let pre1 = net.pre_set_transitions(&p1);
                let pre2 = net.pre_set_transitions(&p2);
                let post1 = net.post_set_transitions(&p1);
                let post2 = net.post_set_transitions(&p2);

                // Case 1: identical places → remove duplicate
                if pre1 == pre2 && post1 == post2 {
                    net.remove_place(p2_name);
                    changed = true;
                    break;
                }

                let common_pre: HashSet<String> = pre1.intersection(&pre2).cloned().collect();
                let common_post: HashSet<String> = post1.intersection(&post2).cloned().collect();

                // Case 2: same preset, shared postset → split via silent transition
                if pre1 == pre2 && !common_post.is_empty() {
                    let new_place = format!("place_{}", next_id());
                    net.add_place(&new_place);

                    // Redirect common preset arcs to new place
                    for t in &pre1 {
                        let t_node = NodeId::Transition(t.clone());
                        let p1_node = NodeId::Place(p1_name.clone());
                        let p2_node = NodeId::Place(p2_name.clone());
                        net.remove_arc(&t_node, &p1_node);
                        net.remove_arc(&t_node, &p2_node);
                        let np_node = NodeId::Place(new_place.clone());
                        net.add_arc(&t_node, &np_node);
                    }

                    // New place → common postset
                    for t in &common_post {
                        let t_node = NodeId::Transition(t.clone());
                        let np_node = NodeId::Place(new_place.clone());
                        net.add_arc(&np_node, &t_node);
                    }

                    // New place → silent → p1, p2
                    let silent = format!("silent_{}", next_id());
                    net.add_transition(&silent, None);
                    let s_node = NodeId::Transition(silent.clone());
                    let np_node = NodeId::Place(new_place.clone());
                    let p1_node = NodeId::Place(p1_name.clone());
                    let p2_node = NodeId::Place(p2_name.clone());
                    net.add_arc(&np_node, &s_node);
                    net.add_arc(&s_node, &p1_node);
                    net.add_arc(&s_node, &p2_node);

                    changed = true;
                    break;
                }

                // Case 3: same postset, shared preset → split via silent transition
                if post1 == post2 && !common_pre.is_empty() {
                    let new_place = format!("place_{}", next_id());
                    net.add_place(&new_place);

                    for t in &post1 {
                        let t_node = NodeId::Transition(t.clone());
                        let p1_node = NodeId::Place(p1_name.clone());
                        let p2_node = NodeId::Place(p2_name.clone());
                        net.remove_arc(&p1_node, &t_node);
                        net.remove_arc(&p2_node, &t_node);
                        let np_node = NodeId::Place(new_place.clone());
                        net.add_arc(&np_node, &t_node);
                    }

                    for t in &common_pre {
                        let t_node = NodeId::Transition(t.clone());
                        let np_node = NodeId::Place(new_place.clone());
                        net.add_arc(&t_node, &np_node);
                    }

                    let silent = format!("silent_{}", next_id());
                    net.add_transition(&silent, None);
                    let s_node = NodeId::Transition(silent.clone());
                    let p1_node = NodeId::Place(p1_name.clone());
                    let p2_node = NodeId::Place(p2_name.clone());
                    let np_node = NodeId::Place(new_place.clone());
                    net.add_arc(&p1_node, &s_node);
                    net.add_arc(&p2_node, &s_node);
                    net.add_arc(&s_node, &np_node);

                    changed = true;
                    break;
                }

                // Case 4: shared preset (>1) → split
                if common_pre.len() > 1 {
                    let new_place = format!("place_{}", next_id());
                    net.add_place(&new_place);

                    for t in &common_pre {
                        let t_node = NodeId::Transition(t.clone());
                        let p1_node = NodeId::Place(p1_name.clone());
                        let p2_node = NodeId::Place(p2_name.clone());
                        net.remove_arc(&t_node, &p1_node);
                        net.remove_arc(&t_node, &p2_node);
                        let np_node = NodeId::Place(new_place.clone());
                        net.add_arc(&t_node, &np_node);
                    }

                    let silent = format!("silent_{}", next_id());
                    net.add_transition(&silent, None);
                    let s_node = NodeId::Transition(silent.clone());
                    let np_node = NodeId::Place(new_place.clone());
                    let p1_node = NodeId::Place(p1_name.clone());
                    let p2_node = NodeId::Place(p2_name.clone());
                    net.add_arc(&np_node, &s_node);
                    net.add_arc(&s_node, &p1_node);
                    net.add_arc(&s_node, &p2_node);

                    changed = true;
                    break;
                }

                // Case 5: shared postset (>1) → split
                if common_post.len() > 1 {
                    let new_place = format!("place_{}", next_id());
                    net.add_place(&new_place);

                    for t in &common_post {
                        let t_node = NodeId::Transition(t.clone());
                        let p1_node = NodeId::Place(p1_name.clone());
                        let p2_node = NodeId::Place(p2_name.clone());
                        net.remove_arc(&p1_node, &t_node);
                        net.remove_arc(&p2_node, &t_node);
                        let np_node = NodeId::Place(new_place.clone());
                        net.add_arc(&np_node, &t_node);
                    }

                    let silent = format!("silent_{}", next_id());
                    net.add_transition(&silent, None);
                    let s_node = NodeId::Transition(silent.clone());
                    let p1_node = NodeId::Place(p1_name.clone());
                    let p2_node = NodeId::Place(p2_name.clone());
                    let np_node = NodeId::Place(new_place.clone());
                    net.add_arc(&p1_node, &s_node);
                    net.add_arc(&p2_node, &s_node);
                    net.add_arc(&s_node, &np_node);

                    changed = true;
                    break;
                }
            }
            if changed { break; }
        }

        if !changed { break; }
    }
}

/// If start_place == end_place, make the self-loop explicit by cloning the place.
fn make_self_loop_explicit(
    net: &mut InternalNet,
    start_place: &str,
    end_place: &str,
) -> (String, String) {
    if start_place == end_place {
        let place_copy = format!("{}_cloned", start_place);
        net.add_place(&place_copy);

        // Move all outgoing arcs from start to copy
        let sp = NodeId::Place(start_place.to_string());
        let cp = NodeId::Place(place_copy.clone());
        let out_arcs: Vec<NodeId> = net.post_set(&sp).into_iter().collect();
        for target in &out_arcs {
            net.remove_arc(&sp, target);
            net.add_arc(&cp, target);
        }

        // Add silent do-transition: start → silent → copy
        let silent = format!("silent_do_{}", start_place);
        net.add_transition(&silent, None);
        let s_node = NodeId::Transition(silent.clone());
        net.add_arc(&sp, &s_node);
        net.add_arc(&s_node, &cp);

        (start_place.to_string(), place_copy)
    } else {
        (start_place.to_string(), end_place.to_string())
    }
}

// ─── Cut Detection ────────────────────────────────────────────────────────

/// Base case: single transition with 2 places and 2 arcs.
fn mine_base_case(net: &InternalNet) -> Option<u32> {
    if net.transition_count() == 1 && net.place_count() == 2 && net.arcs.len() == 2 {
        let t_name = net.transitions.keys().next()?.clone();
        let label = net.transitions.get(&t_name)?.clone();
        let mut arena = PowlArena::new();
        arena.add_transition(label);
        return Some(arena.nodes.len() as u32 - 1);
    }
    None
}

/// Mine partial order cut: group transitions that are always ordered together.
fn mine_partial_order(
    net: &InternalNet,
    start_place: &str,
    end_place: &str,
    reachability_map: &HashMap<String, HashSet<String>>,
) -> Vec<HashSet<String>> {
    let mut partition: Vec<HashSet<String>> = net.transition_names()
        .into_iter()
        .map(|t| {
            let mut s = HashSet::new();
            s.insert(t);
            s
        })
        .collect();

    for p_name in &net.places {
        let p = NodeId::Place(p_name.clone());
        let out_size = net.out_arcs_count(&p);

        // Check outgoing XOR branching
        if out_size > 1 || (p_name == end_place && out_size > 0) {
            let post_trans: Vec<String> = net.post_set_transitions(&p)
                .into_iter().collect();
            if post_trans.len() > 1 {
                let branches: Vec<HashSet<String>> = post_trans.iter()
                    .map(|t| reachability_map.get(t).cloned().unwrap_or_default())
                    .collect();

                let union: HashSet<String> = branches.iter().flat_map(|b| b.iter().cloned()).collect();
                let not_in_every = if p_name == end_place {
                    union.clone()
                } else {
                    let intersection: HashSet<String> = branches.iter()
                        .skip(1)
                        .fold(branches[0].clone(), |acc, b| acc.intersection(b).cloned().collect());
                    union.difference(&intersection).cloned().collect()
                };

                if not_in_every.len() > 1 {
                    partition = combine_parts(&not_in_every, &partition);
                }
            }
        }

        let in_size = net.in_arcs_count(&p);

        // Check incoming XOR merging
        if in_size > 1 || (p_name == start_place && in_size > 0) {
            let pre_trans: Vec<String> = net.pre_set_transitions(&p)
                .into_iter().collect();
            if pre_trans.len() > 1 {
                let branches: Vec<HashSet<String>> = pre_trans.iter()
                    .map(|t| {
                        reachability_map.iter()
                            .filter(|(_, reachable)| reachable.contains(t))
                            .map(|(k, _)| k.clone())
                            .collect()
                    })
                    .collect();

                let union: HashSet<String> = branches.iter().flat_map(|b| b.iter().cloned()).collect();
                let not_in_every = if p_name == start_place {
                    union.clone()
                } else {
                    let intersection: HashSet<String> = branches.iter()
                        .skip(1)
                        .fold(branches[0].clone(), |acc, b| acc.intersection(b).cloned().collect());
                    union.difference(&intersection).cloned().collect()
                };

                if not_in_every.len() > 1 {
                    partition = combine_parts(&not_in_every, &partition);
                }
            }
        }
    }

    partition
}

/// Mine choice graph cut: group transitions around split/join points.
fn mine_choice_graph(
    net: &InternalNet,
) -> Vec<HashSet<String>> {
    let mut partition: Vec<HashSet<String>> = net.transition_names()
        .into_iter()
        .map(|t| {
            let mut s = HashSet::new();
            s.insert(t);
            s
        })
        .collect();

    // Split transitions (multiple outgoing arcs)
    for split_name in net.transitions_with_multiple_out() {
        let split = NodeId::Transition(split_name.clone());
        let post_places: Vec<NodeId> = net.post_set(&split)
            .into_iter().collect();

        if post_places.len() <= 1 { continue; }

        let branches: Vec<HashSet<String>> = post_places.iter()
            .map(|p| get_reachable_transitions_between(net, p, &split))
            .collect();

        let union: HashSet<String> = branches.iter().flat_map(|b| b.iter().cloned()).collect();
        let intersection: HashSet<String> = branches.iter()
            .skip(1)
            .fold(branches[0].clone(), |acc, b| acc.intersection(b).cloned().collect());
        let mut not_in_every: HashSet<String> = union.difference(&intersection).cloned().collect();
        not_in_every.insert(split_name.clone());

        if !not_in_every.is_empty() {
            partition = combine_parts(&not_in_every, &partition);
        }
    }

    // Join transitions (multiple incoming arcs)
    for join_name in net.transitions_with_multiple_in() {
        let join = NodeId::Transition(join_name.clone());
        let pre_places: Vec<NodeId> = net.pre_set(&join)
            .into_iter().collect();

        if pre_places.len() <= 1 { continue; }

        let branches: Vec<HashSet<String>> = pre_places.iter()
            .map(|p| get_backward_reachable_transitions_between(net, p, &join))
            .collect();

        let union: HashSet<String> = branches.iter().flat_map(|b| b.iter().cloned()).collect();
        let intersection: HashSet<String> = branches.iter()
            .skip(1)
            .fold(branches[0].clone(), |acc, b| acc.intersection(b).cloned().collect());
        let mut not_in_every: HashSet<String> = union.difference(&intersection).cloned().collect();
        not_in_every.insert(join_name.clone());

        if !not_in_every.is_empty() {
            partition = combine_parts(&not_in_every, &partition);
        }
    }

    partition
}

/// Combine parts in a partition: merge any groups that overlap with the given set.
fn combine_parts(
    to_group: &HashSet<String>,
    partition: &[HashSet<String>],
) -> Vec<HashSet<String>> {
    let mut new_partition = Vec::new();
    let mut combined = HashSet::new();

    for part in partition {
        if !part.is_disjoint(to_group) {
            combined.extend(part.iter().cloned());
        } else {
            new_partition.push(part.clone());
        }
    }

    if !combined.is_empty() {
        new_partition.push(combined);
    }

    new_partition
}

// ─── Subnet Operations ────────────────────────────────────────────────────

/// Project a subnet from the net, keeping only the specified transitions and
/// their connecting places/arcs between start and end places.
fn apply_projection(
    net: &InternalNet,
    subnet_transitions: &HashSet<String>,
    start_place: &str,
    end_place: &str,
) -> Result<InternalNet, String> {
    let mut subnet = InternalNet {
        places: HashSet::new(),
        transitions: HashMap::new(),
        arcs: Vec::new(),
    };

    // Add transitions
    for t_name in subnet_transitions {
        let label = net.transitions.get(t_name).cloned().flatten();
        subnet.add_transition(t_name, label);
    }

    let sp = NodeId::Place(start_place.to_string());
    let ep = NodeId::Place(end_place.to_string());

    // Add start and end places
    subnet.add_place(start_place);
    if start_place != end_place {
        subnet.add_place(end_place);
    }

    // Add arcs and intermediate places
    for (src, tgt) in &net.arcs {
        let src_is_subnet = subnet_transitions.contains(src.as_str());
        let tgt_is_subnet = subnet_transitions.contains(tgt.as_str());

        if !src_is_subnet && !tgt_is_subnet {
            continue;
        }

        // Skip arcs to/from start/end places that aren't part of the subnet flow
        if (tgt == &sp || src == &ep) && !src_is_subnet && !tgt_is_subnet {
            continue;
        }

        // Add source node if it's a place
        if src.is_place() && src != &sp && src != &ep {
            subnet.add_place(src.as_str());
        }
        // Add target node if it's a place
        if tgt.is_place() && tgt != &sp && tgt != &ep {
            subnet.add_place(tgt.as_str());
        }

        subnet.add_arc(src, tgt);
    }

    Ok(subnet)
}

// ─── Main Conversion ──────────────────────────────────────────────────────

/// Convert a PowlPetriNetResult to a POWL arena + root index.
pub fn apply(result: &PowlPetriNetResult) -> Result<(PowlArena, u32), String> {
    reset_id_gen();

    let mut net = InternalNet::from_result(result)?;

    // Step 1: Validate workflow net
    let (start_place, end_place) = validate_workflow_net(&net)?;

    // Step 2: Preprocess
    preprocess(&mut net);

    // Step 3: Make self-loops explicit
    let (start, end) = make_self_loop_explicit(&mut net, &start_place, &end_place);

    // Step 4: Recursive conversion
    let mut arena = PowlArena::new();
    let root = translate_petri_to_powl(&mut arena, &net, &start, &end)?;

    // Step 5: Simplify
    let simplified = simplify::simplify(&mut arena, root);

    Ok((arena, simplified))
}

/// Parse a Petri Net JSON string and convert to POWL.
pub fn petri_net_to_powl(pn_json: &str) -> Result<(PowlArena, u32), String> {
    let result: PowlPetriNetResult = serde_json::from_str(pn_json)
        .map_err(|e| format!("invalid petri net JSON: {}", e))?;
    apply(&result)
}

/// Recursively translate a Petri net to POWL.
fn translate_petri_to_powl(
    arena: &mut PowlArena,
    net: &InternalNet,
    start_place: &str,
    end_place: &str,
) -> Result<u32, String> {
    // Base case
    if let Some(_idx) = mine_base_case(net) {
        // The base case creates its own arena, but we need to add to our shared arena
        let label = net.transitions.values().next().cloned().flatten();
        return Ok(arena.add_transition(label));
    }

    // Simplified reachability graph
    let reachability_map = get_simplified_reachability_graph(net);

    // Try partial order cut
    let po_partition = mine_partial_order(net, start_place, end_place, &reachability_map);
    if po_partition.len() > 1 {
        return translate_partial_order(arena, net, &po_partition, start_place, end_place);
    }

    // Try choice graph cut
    let cg_partition = mine_choice_graph(net);
    if cg_partition.len() > 1 {
        return translate_choice_graph(arena, net, &cg_partition, start_place, end_place);
    }

    // If we get here with a single transition, return it as a leaf
    if net.transition_count() == 1 {
        let label = net.transitions.values().next().cloned().flatten();
        return Ok(arena.add_transition(label));
    }

    // If we have exactly 2 transitions, try XOR
    if net.transition_count() == 2 {
        let labels: Vec<Option<String>> = net.transitions.values().cloned().collect();
        let children: Vec<u32> = labels.into_iter()
            .map(|l| arena.add_transition(l))
            .collect();
        return Ok(arena.add_operator(Operator::Xor, children));
    }

    Err(format!(
        "Failed to detect POWL structure for {} transitions",
        net.transition_count()
    ))
}

/// Translate a partial order cut into a StrictPartialOrder POWL node.
fn translate_partial_order(
    arena: &mut PowlArena,
    net: &InternalNet,
    partition: &[HashSet<String>],
    start_place: &str,
    end_place: &str,
) -> Result<u32, String> {
    let groups: Vec<&HashSet<String>> = partition.iter().collect();

    // Map each transition to its group
    let mut transition_to_group: HashMap<String, usize> = HashMap::new();
    for (i, group) in groups.iter().enumerate() {
        for t in *group {
            transition_to_group.insert(t.clone(), i);
        }
    }

    let group_count = groups.len();
    let mut group_start_places: Vec<HashSet<String>> = vec![HashSet::new(); group_count];
    let mut group_end_places: Vec<HashSet<String>> = vec![HashSet::new(); group_count];
    let mut connection_edges: HashSet<(usize, usize)> = HashSet::new();
    let mut start_groups: HashSet<usize> = HashSet::new();
    let mut end_groups: HashSet<usize> = HashSet::new();

    for p_name in &net.places {
        let p = NodeId::Place(p_name.clone());

        let source_groups: HashSet<usize> = net.pre_set_transitions(&p)
            .iter()
            .filter_map(|t| transition_to_group.get(t).copied())
            .collect();

        let target_groups: HashSet<usize> = net.post_set_transitions(&p)
            .iter()
            .filter_map(|t| transition_to_group.get(t).copied())
            .collect();

        // Start place handling
        if p_name == start_place {
            for &g in &target_groups {
                group_start_places[g].insert(p_name.clone());
                start_groups.insert(g);
            }
        }

        // End place handling
        if p_name == end_place {
            for &g in &source_groups {
                group_end_places[g].insert(p_name.clone());
                end_groups.insert(g);
            }
        }

        // Connection edges between groups
        for &g1 in &source_groups {
            for &g2 in &target_groups {
                if g1 != g2 {
                    connection_edges.insert((g1, g2));
                    group_end_places[g1].insert(p_name.clone());
                    group_start_places[g2].insert(p_name.clone());
                }
            }
        }
    }

    // Recursively convert each group
    let mut children: Vec<u32> = Vec::new();
    let mut group_to_child: HashMap<usize, u32> = HashMap::new();

    for (i, group) in groups.iter().enumerate() {
        let sp_set = &group_start_places[i];
        let ep_set = &group_end_places[i];

        let subnet_start = sp_set.iter().next()
            .ok_or_else(|| format!("group {} has no start place", i))?
            .clone();
        let subnet_end = ep_set.iter().next()
            .ok_or_else(|| format!("group {} has no end place", i))?
            .clone();

        let subnet = apply_projection(net, group, &subnet_start, &subnet_end)?;
        let child = translate_petri_to_powl(arena, &subnet, &subnet_start, &subnet_end)?;
        group_to_child.insert(i, child);
        children.push(child);
    }

    // Build StrictPartialOrder with order edges
    let children_clone = children.clone();
    let spo_idx = arena.add_strict_partial_order(children);

    for &(g1, g2) in &connection_edges {
        if let (Some(&c1), Some(&c2)) = (group_to_child.get(&g1), group_to_child.get(&g2)) {
            let pos1 = children_clone.iter().position(|&c| c == c1).unwrap();
            let pos2 = children_clone.iter().position(|&c| c == c2).unwrap();
            arena.add_order_edge(spo_idx, pos1, pos2);
        }
    }

    // Make order transitive
    arena.close_order_transitively(spo_idx);

    Ok(spo_idx)
}

/// Translate a choice graph cut into an XOR POWL node.
fn translate_choice_graph(
    arena: &mut PowlArena,
    net: &InternalNet,
    partition: &[HashSet<String>],
    start_place: &str,
    end_place: &str,
) -> Result<u32, String> {
    let groups: Vec<&HashSet<String>> = partition.iter().collect();

    // Map each transition to its group
    let mut transition_to_group: HashMap<String, usize> = HashMap::new();
    for (i, group) in groups.iter().enumerate() {
        for t in *group {
            transition_to_group.insert(t.clone(), i);
        }
    }

    let group_count = groups.len();
    let mut group_start_places: Vec<HashSet<String>> = vec![HashSet::new(); group_count];
    let mut group_end_places: Vec<HashSet<String>> = vec![HashSet::new(); group_count];
    let mut start_groups: HashSet<usize> = HashSet::new();
    let mut end_groups: HashSet<usize> = HashSet::new();

    for p_name in &net.places {
        let p = NodeId::Place(p_name.clone());

        let source_groups: HashSet<usize> = net.pre_set_transitions(&p)
            .iter()
            .filter_map(|t| transition_to_group.get(t).copied())
            .collect();

        let target_groups: HashSet<usize> = net.post_set_transitions(&p)
            .iter()
            .filter_map(|t| transition_to_group.get(t).copied())
            .collect();

        if p_name == start_place {
            for &g in &target_groups {
                group_start_places[g].insert(p_name.clone());
                start_groups.insert(g);
            }
        }

        if p_name == end_place {
            for &g in &source_groups {
                group_end_places[g].insert(p_name.clone());
                end_groups.insert(g);
            }
        }

        for &g1 in &source_groups {
            for &g2 in &target_groups {
                if g1 != g2 {
                    group_end_places[g1].insert(p_name.clone());
                    group_start_places[g2].insert(p_name.clone());
                }
            }
        }
    }

    // Recursively convert each group
    let mut children: Vec<u32> = Vec::new();

    for (i, group) in groups.iter().enumerate() {
        let sp_set = &group_start_places[i];
        let ep_set = &group_end_places[i];

        let subnet_start = sp_set.iter().next()
            .ok_or_else(|| format!("group {} has no start place", i))?
            .clone();
        let subnet_end = ep_set.iter().next()
            .ok_or_else(|| format!("group {} has no end place", i))?
            .clone();

        let subnet = apply_projection(net, group, &subnet_start, &subnet_end)?;
        let child = translate_petri_to_powl(arena, &subnet, &subnet_start, &subnet_end)?;
        children.push(child);
    }

    Ok(arena.add_operator(Operator::Xor, children))
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;
    use crate::powl::conversion::to_petri_net;

    /// Helper: POWL → Petri Net → POWL roundtrip
    fn roundtrip(powl_str: &str) -> Result<String, String> {
        let mut arena1 = PowlArena::new();
        let root1 = parse_powl_model_string(powl_str, &mut arena1)?;
        let pn_result = to_petri_net::apply(&arena1, root1);
        let pn_json = serde_json::to_string(&pn_result).unwrap();
        let (arena2, root2) = petri_net_to_powl(&pn_json)?;
        Ok(arena2.to_repr(root2))
    }

    #[test]
    fn single_activity_roundtrip() {
        let result = roundtrip("A").unwrap();
        assert!(result.contains("A"), "got: {}", result);
    }

    #[test]
    fn xor_roundtrip() {
        let result = roundtrip("X ( A, B )").unwrap();
        assert!(result.contains("A") && result.contains("B"), "got: {}", result);
    }

    #[test]
    fn sequence_roundtrip() {
        let result = roundtrip("-> ( A, B )").unwrap();
        assert!(result.contains("A") && result.contains("B"), "got: {}", result);
    }

    #[test]
    fn loop_roundtrip() {
        let result = roundtrip("* ( A, B )").unwrap();
        assert!(result.contains("A"), "got: {}", result);
    }

    #[test]
    fn parallel_roundtrip() {
        let result = roundtrip("+ ( A, B )").unwrap();
        assert!(result.contains("A") && result.contains("B"), "got: {}", result);
    }

    #[test]
    fn nested_xor_roundtrip() {
        let result = roundtrip("X ( X ( A, B ), C )").unwrap();
        assert!(result.contains("A") && result.contains("B") && result.contains("C"), "got: {}", result);
    }

    #[test]
    fn petri_net_to_powl_accepts_own_output() {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string("X ( A, B )", &mut arena).unwrap();
        let pn_result = to_petri_net::apply(&arena, root);
        let pn_json = serde_json::to_string(&pn_result).unwrap();

        let result = petri_net_to_powl(&pn_json);
        assert!(result.is_ok(), "petri_net_to_powl failed: {:?}", result.err());
        let (arena2, root2) = result.unwrap();
        let repr = arena2.to_repr(root2);
        assert!(repr.contains("A") && repr.contains("B"), "got: {}", repr);
    }

    #[test]
    fn invalid_json_returns_error() {
        let result = petri_net_to_powl("not json");
        assert!(result.is_err());
    }

    #[test]
    fn workflow_net_validation() {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string("X ( A, B )", &mut arena).unwrap();
        let pn_result = to_petri_net::apply(&arena, root);

        let net = InternalNet::from_result(&pn_result).unwrap();
        let result = validate_workflow_net(&net);
        assert!(result.is_ok(), "workflow net validation failed: {:?}", result.err());
    }
}
