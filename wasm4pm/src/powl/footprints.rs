//! POWL footprint analysis.
//!
//! Ports `pm4py/algo/discovery/footprints/powl/variants/bottomup.py`.

use crate::powl_arena::{Operator, PowlArena, PowlNode};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

pub type ActivitySet = HashSet<String>;
pub type ActivityPairs = HashSet<(String, String)>;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Footprints {
    pub start_activities: ActivitySet,
    pub end_activities: ActivitySet,
    pub activities: ActivitySet,
    pub skippable: bool,
    pub sequence: ActivityPairs,
    pub parallel: ActivityPairs,
    pub activities_always_happening: ActivitySet,
    pub min_trace_length: usize,
}

impl Footprints {
    fn empty_skip() -> Self {
        Footprints {
            skippable: true,
            ..Default::default()
        }
    }

    fn single(label: &str) -> Self {
        let act: ActivitySet = [label.to_string()].into();
        Footprints {
            start_activities: act.clone(),
            end_activities: act.clone(),
            activities: act.clone(),
            skippable: false,
            sequence: Default::default(),
            parallel: Default::default(),
            activities_always_happening: act,
            min_trace_length: 1,
        }
    }
}

fn fix_fp(
    mut sequence: ActivityPairs,
    mut parallel: ActivityPairs,
) -> (ActivityPairs, ActivityPairs) {
    sequence = sequence.difference(&parallel).cloned().collect();
    let bidirectional: ActivityPairs = sequence
        .iter()
        .filter(|(a, b)| sequence.contains(&(b.clone(), a.clone())))
        .cloned()
        .collect();
    for pair in &bidirectional {
        parallel.insert(pair.clone());
        sequence.remove(pair);
    }
    (sequence, parallel)
}

fn merge_footprints(fps: &[Footprints]) -> Footprints {
    if fps.is_empty() {
        return Footprints::empty_skip();
    }
    let mut merged = fps[0].clone();
    for fp in &fps[1..] {
        merged.activities = merged.activities.union(&fp.activities).cloned().collect();
        merged.skippable = merged.skippable && fp.skippable;
        merged.sequence = merged.sequence.union(&fp.sequence).cloned().collect();
        merged.parallel = merged.parallel.union(&fp.parallel).cloned().collect();
        if !fp.skippable {
            merged.activities_always_happening = merged
                .activities_always_happening
                .union(&fp.activities_always_happening)
                .cloned()
                .collect();
        }
    }
    merged
}

fn footprints_of_transition(label: Option<&str>) -> Footprints {
    match label {
        None => Footprints::empty_skip(),
        Some(l) => Footprints::single(l),
    }
}

fn footprints_of_xor(children: &[Footprints]) -> Footprints {
    let mut start: ActivitySet = Default::default();
    let mut end: ActivitySet = Default::default();
    let mut activities: ActivitySet = Default::default();
    let mut skippable = false;
    let mut sequence: ActivityPairs = Default::default();
    let mut parallel: ActivityPairs = Default::default();
    let mut aah: Option<ActivitySet> = None;

    for fp in children {
        start = start.union(&fp.start_activities).cloned().collect();
        end = end.union(&fp.end_activities).cloned().collect();
        activities = activities.union(&fp.activities).cloned().collect();
        skippable = skippable || fp.skippable;
        sequence = sequence.union(&fp.sequence).cloned().collect();
        parallel = parallel.union(&fp.parallel).cloned().collect();
        if !fp.skippable {
            aah = Some(match aah {
                None => fp.activities_always_happening.clone(),
                Some(prev) => prev
                    .intersection(&fp.activities_always_happening)
                    .cloned()
                    .collect(),
            });
        }
    }

    let (sequence, parallel) = fix_fp(sequence, parallel);
    let min_trace_length = children
        .iter()
        .map(|fp| fp.min_trace_length)
        .min()
        .unwrap_or(0);

    Footprints {
        start_activities: start,
        end_activities: end,
        activities,
        skippable,
        sequence,
        parallel,
        activities_always_happening: aah.unwrap_or_default(),
        min_trace_length,
    }
}

fn footprints_of_loop(do_fp: &Footprints, redo_fp: &Footprints) -> Footprints {
    let mut start = do_fp.start_activities.clone();
    let mut end = do_fp.end_activities.clone();
    let activities: ActivitySet = do_fp
        .activities
        .union(&redo_fp.activities)
        .cloned()
        .collect();
    let mut sequence: ActivityPairs = do_fp.sequence.union(&redo_fp.sequence).cloned().collect();
    let parallel: ActivityPairs = do_fp.parallel.union(&redo_fp.parallel).cloned().collect();
    let skippable = do_fp.skippable;
    let aah: ActivitySet = if !do_fp.skippable {
        do_fp.activities_always_happening.clone()
    } else {
        Default::default()
    };

    if do_fp.skippable {
        start = start.union(&redo_fp.start_activities).cloned().collect();
        end = end.union(&redo_fp.end_activities).cloned().collect();
    }

    for a1 in &do_fp.end_activities {
        for a2 in &redo_fp.start_activities {
            sequence.insert((a1.clone(), a2.clone()));
        }
    }
    for a1 in &redo_fp.end_activities {
        for a2 in &do_fp.start_activities {
            sequence.insert((a1.clone(), a2.clone()));
        }
    }
    if do_fp.skippable {
        for a1 in &redo_fp.end_activities {
            for a2 in &redo_fp.start_activities {
                sequence.insert((a1.clone(), a2.clone()));
            }
        }
    }
    if redo_fp.skippable {
        for a1 in &do_fp.end_activities {
            for a2 in &do_fp.start_activities {
                sequence.insert((a1.clone(), a2.clone()));
            }
        }
    }

    let (sequence, parallel) = fix_fp(sequence, parallel);

    Footprints {
        start_activities: start,
        end_activities: end,
        activities,
        skippable,
        sequence,
        parallel,
        activities_always_happening: aah,
        min_trace_length: do_fp.min_trace_length,
    }
}

fn footprints_of_partial_order(
    children_fps: &[Footprints],
    _order_n: usize,
    order_is_edge: &dyn Fn(usize, usize) -> bool,
) -> Footprints {
    let n = children_fps.len();
    if n == 0 {
        return Footprints::empty_skip();
    }

    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (i, row) in adj.iter_mut().enumerate() {
        for j in 0..n {
            if order_is_edge(i, j) {
                row.push(j);
            }
        }
    }

    let closure: Vec<HashSet<usize>> = {
        let mut cl: Vec<HashSet<usize>> = (0..n)
            .map(|i| {
                let mut s = HashSet::new();
                s.insert(i);
                s
            })
            .collect();
        for (start, cl_entry) in cl.iter_mut().enumerate() {
            let mut visited: HashSet<usize> = HashSet::new();
            let mut queue = VecDeque::new();
            queue.push_back(start);
            while let Some(cur) = queue.pop_front() {
                if visited.contains(&cur) {
                    continue;
                }
                visited.insert(cur);
                cl_entry.insert(cur);
                for &nxt in &adj[cur] {
                    queue.push_back(nxt);
                }
            }
        }
        cl
    };

    let reduced_adj: Vec<Vec<usize>> = (0..n)
        .map(|i| {
            adj[i]
                .iter()
                .filter(|&&j| !adj[i].iter().any(|&k| k != j && closure[k].contains(&j)))
                .cloned()
                .collect()
        })
        .collect();

    let merged = merge_footprints(children_fps);
    let mut sequence = merged.sequence.clone();
    let mut parallel = merged.parallel.clone();

    let mut start_activities: ActivitySet = Default::default();
    for (i, fp_c) in children_fps.iter().enumerate() {
        let is_start = children_fps
            .iter()
            .enumerate()
            .all(|(pi, fp_p)| pi == i || fp_p.skippable || !closure[pi].contains(&i));
        if is_start {
            start_activities = start_activities
                .union(&fp_c.start_activities)
                .cloned()
                .collect();
        }
    }

    let mut end_activities: ActivitySet = Default::default();
    for (i, fp_c) in children_fps.iter().enumerate() {
        let is_end = children_fps
            .iter()
            .enumerate()
            .all(|(qi, fp_q)| qi == i || fp_q.skippable || !closure[i].contains(&qi));
        if is_end {
            end_activities = end_activities
                .union(&fp_c.end_activities)
                .cloned()
                .collect();
        }
    }

    for i in 0..n {
        for &j in &reduced_adj[i] {
            for a1 in &children_fps[i].end_activities {
                for a2 in &children_fps[j].start_activities {
                    sequence.insert((a1.clone(), a2.clone()));
                }
            }
        }
    }

    for i in 0..n {
        for j in 0..n {
            if i == j || !closure[i].contains(&j) {
                continue;
            }
            let all_skippable_intermediates = children_fps.iter().enumerate().all(|(k, fp_k)| {
                k == i
                    || k == j
                    || fp_k.skippable
                    || !(closure[i].contains(&k) && closure[k].contains(&j))
            });
            if all_skippable_intermediates {
                for a1 in &children_fps[i].end_activities {
                    for a2 in &children_fps[j].start_activities {
                        sequence.insert((a1.clone(), a2.clone()));
                    }
                }
            }
        }
    }

    for i in 0..n {
        for j in (i + 1)..n {
            if !closure[i].contains(&j) && !closure[j].contains(&i) {
                for a1 in &children_fps[i].activities {
                    for a2 in &children_fps[j].activities {
                        parallel.insert((a1.clone(), a2.clone()));
                        parallel.insert((a2.clone(), a1.clone()));
                    }
                }
            }
        }
    }

    let (sequence, parallel) = fix_fp(sequence, parallel);

    let min_trace_length: usize = children_fps
        .iter()
        .filter(|fp| !fp.skippable)
        .map(|fp| fp.min_trace_length)
        .sum();

    Footprints {
        start_activities,
        end_activities,
        activities: merged.activities,
        skippable: merged.skippable,
        sequence,
        parallel,
        activities_always_happening: merged.activities_always_happening,
        min_trace_length,
    }
}

pub fn compute(
    arena: &PowlArena,
    node_idx: u32,
    cache: &mut HashMap<u32, Footprints>,
) -> Footprints {
    if let Some(fp) = cache.get(&node_idx) {
        return fp.clone();
    }

    let fp = match arena.get(node_idx) {
        None => Footprints::empty_skip(),

        Some(PowlNode::Transition(t)) => footprints_of_transition(t.label.as_deref()),
        Some(PowlNode::FrequentTransition(t)) => {
            let mut fp = footprints_of_transition(Some(&t.activity));
            if t.skippable {
                fp.skippable = true;
                fp.activities_always_happening.clear();
            }
            fp
        }

        Some(PowlNode::OperatorPowl(op)) => {
            let children = op.children.clone();
            let operator = op.operator;
            let child_fps: Vec<Footprints> =
                children.iter().map(|&c| compute(arena, c, cache)).collect();
            match operator {
                Operator::Xor => footprints_of_xor(&child_fps),
                Operator::Loop if child_fps.len() == 2 => {
                    footprints_of_loop(&child_fps[0], &child_fps[1])
                }
                _ => footprints_of_xor(&child_fps),
            }
        }

        Some(PowlNode::StrictPartialOrder(spo)) => {
            let children = spo.children.clone();
            let order = spo.order.clone();
            let n = children.len();
            let child_fps: Vec<Footprints> =
                children.iter().map(|&c| compute(arena, c, cache)).collect();
            footprints_of_partial_order(&child_fps, n, &|i, j| order.is_edge(i, j))
        }

        Some(PowlNode::DecisionGraph(dg)) => {
            // Treat as StrictPartialOrder for footprint computation
            let children = dg.children.clone();
            let order = dg.order.clone();
            let n = children.len();
            let child_fps: Vec<Footprints> =
                children.iter().map(|&c| compute(arena, c, cache)).collect();
            footprints_of_partial_order(&child_fps, n, &|i, j| order.is_edge(i, j))
        }
    };

    cache.insert(node_idx, fp.clone());
    fp
}

pub fn apply(arena: &PowlArena, root: u32) -> Footprints {
    let mut cache = HashMap::new();
    compute(arena, root, &mut cache)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn build(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn test_footprints_single_and_tau() {
        // Happy path: single activity has start=end
        let (arena, root) = build("A");
        let fp = apply(&arena, root);
        assert!(fp.start_activities.contains("A"));
        assert!(fp.end_activities.contains("A"));
        assert!(!fp.skippable);
        assert_eq!(fp.min_trace_length, 1);

        // Edge case: tau is skippable
        let (arena, root) = build("tau");
        let fp = apply(&arena, root);
        assert!(fp.skippable);
        assert_eq!(fp.min_trace_length, 0);
    }

    #[test]
    fn test_footprints_xor_and_sequence() {
        // XOR can start with either branch
        let (arena, root) = build("X ( A, B )");
        let fp = apply(&arena, root);
        assert!(fp.start_activities.contains("A"));
        assert!(fp.start_activities.contains("B"));

        // Sequence PO has ordered start/end
        let (arena, root) = build("PO=(nodes={A, B}, order={A-->B})");
        let fp = apply(&arena, root);
        assert!(fp.start_activities.contains("A"));
        assert!(fp.end_activities.contains("B"));
        assert!(fp.sequence.contains(&("A".to_string(), "B".to_string())));
    }

    #[test]
    fn test_footprints_parallel() {
        // Concurrent PO produces bidirectional parallel edges
        let (arena, root) = build("PO=(nodes={A, B}, order={})");
        let fp = apply(&arena, root);
        assert!(fp.parallel.contains(&("A".to_string(), "B".to_string())));
        assert!(fp.parallel.contains(&("B".to_string(), "A".to_string())));
    }
}
