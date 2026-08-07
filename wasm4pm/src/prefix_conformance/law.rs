//! Authored ordering-law model (spec §6): a small, human-authored JSON law
//! describing a strict-precedence activity vocabulary, compiled to a
//! deterministic automaton with an explicit DEAD sink and precomputed
//! completability bitset.
//!
//! Pure Rust — no `wasm-bindgen` dependency. Usable from plain `cargo test`.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

/// A single strict-precedence edge: `after` may only occur if `before` has
/// already occurred earlier in the same case's prefix.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Precedence {
    pub before: String,
    pub after: String,
}

/// The authored reference model ggen (or any activity-ordered process) is
/// judged against. Serialized form documented in spec §6.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderingLaw {
    pub law_version: String,
    pub law_id: String,
    /// Object types (from `event.objects[].type`) that compose the case key.
    pub case_key: Vec<String>,
    pub activities: Vec<String>,
    pub precedence: Vec<Precedence>,
    /// Accepting terminals: a prefix ending in one of these is TERMINAL.
    pub accepting: Vec<String>,
    /// Activities a case may legally open on.
    pub initial: Vec<String>,
}

impl OrderingLaw {
    /// Compile to a DFA + precomputed completability bitset (reverse-BFS
    /// from `accepting`), per spec §4.
    ///
    /// States are represented internally as bitmasks over `activities`
    /// (the *set* of activities folded so far for a case), which generalizes
    /// the "positions in the law" idea from a linear chain to the authored
    /// law's actual shape: a precedence DAG where one activity (e.g.
    /// `RouteSelected`) can gate more than one lawful successor. From a
    /// bitmask `mask`, activity `a` is a legal transition iff:
    ///   - `mask == 0` (nothing observed yet): `a` is in `law.initial`.
    ///   - otherwise: every `Precedence { before, after: a }` has `before`
    ///     already set in `mask` (vacuously legal if no such precedence
    ///     edge exists for `a`).
    /// A bitmask containing any `accepting` activity is a terminal state —
    /// it has no outgoing edges (an episode closes once); any further
    /// activity falls through to `dead_sink` at lookup time, which is how
    /// `PrefixOracle` derives `DuplicateTerminal` (D7).
    pub fn compile(&self) -> CompiledLaw {
        let activities: Vec<&str> = self.activities.iter().map(|s| s.as_str()).collect();
        let n = activities.len();
        assert!(
            n <= 32,
            "OrderingLaw::compile supports at most 32 activities (bitmask state representation)"
        );

        let index_of: HashMap<&str, usize> = activities
            .iter()
            .enumerate()
            .map(|(i, a)| (*a, i))
            .collect();
        let initial_set: HashSet<&str> = self.initial.iter().map(|s| s.as_str()).collect();
        let accepting_set: HashSet<&str> = self.accepting.iter().map(|s| s.as_str()).collect();

        // after -> [before, before, ...] — ALL listed befores must hold.
        let mut requires: HashMap<&str, Vec<&str>> = HashMap::new();
        for p in &self.precedence {
            requires
                .entry(p.after.as_str())
                .or_default()
                .push(p.before.as_str());
        }

        let is_legal = |mask: u32, activity: &str| -> bool {
            if mask == 0 {
                return initial_set.contains(activity);
            }
            match requires.get(activity) {
                Some(reqs) => reqs.iter().all(|before| {
                    let bit = 1u32 << index_of[before];
                    mask & bit != 0
                }),
                None => true,
            }
        };

        let is_terminal_mask = |mask: u32| -> bool {
            activities
                .iter()
                .enumerate()
                .any(|(i, a)| mask & (1u32 << i) != 0 && accepting_set.contains(a))
        };

        let label = |mask: u32| -> String {
            if mask == 0 {
                return "{}".to_string();
            }
            let names: Vec<&str> = activities
                .iter()
                .enumerate()
                .filter(|(i, _)| mask & (1u32 << i) != 0)
                .map(|(_, a)| *a)
                .collect();
            format!("{{{}}}", names.join(","))
        };

        let mut mask_to_id: HashMap<u32, usize> = HashMap::new();
        let mut states: Vec<String> = Vec::new();
        let mut edges: HashMap<(usize, String), usize> = HashMap::new();

        let root: u32 = 0;
        mask_to_id.insert(root, 0);
        states.push(label(root));

        let mut queue: VecDeque<u32> = VecDeque::new();
        queue.push_back(root);

        while let Some(mask) = queue.pop_front() {
            let from_id = mask_to_id[&mask];
            if is_terminal_mask(mask) {
                // Terminal states have no outgoing edges — any further
                // activity falls through to `dead_sink` at lookup time.
                continue;
            }
            for activity in &activities {
                if !is_legal(mask, activity) {
                    continue;
                }
                let bit = 1u32 << index_of[activity];
                let new_mask = mask | bit;
                let to_id = *mask_to_id.entry(new_mask).or_insert_with(|| {
                    states.push(label(new_mask));
                    queue.push_back(new_mask);
                    states.len() - 1
                });
                edges.insert((from_id, activity.to_string()), to_id);
            }
        }

        let dead_sink = states.len();
        states.push("DEAD".to_string());

        let mut accepting = vec![false; states.len()];
        for (&mask, &id) in mask_to_id.iter() {
            accepting[id] = is_terminal_mask(mask);
        }

        // Reverse adjacency over non-DEAD edges, for the completability
        // reverse-BFS (spec §4: "a single reverse-BFS from the accepting
        // set").
        let mut reverse_adj: HashMap<usize, Vec<usize>> = HashMap::new();
        for ((from, _act), to) in edges.iter() {
            if *to != dead_sink {
                reverse_adj.entry(*to).or_default().push(*from);
            }
        }

        let mut completable = vec![false; states.len()];
        let mut queue2: VecDeque<usize> = VecDeque::new();
        for (id, &acc) in accepting.iter().enumerate() {
            if acc {
                completable[id] = true;
                queue2.push_back(id);
            }
        }
        while let Some(s) = queue2.pop_front() {
            if let Some(preds) = reverse_adj.get(&s) {
                for &p in preds {
                    if !completable[p] {
                        completable[p] = true;
                        queue2.push_back(p);
                    }
                }
            }
        }
        completable[dead_sink] = false;

        CompiledLaw {
            states,
            edges,
            dead_sink,
            completable,
            accepting,
        }
    }
}

/// The compiled deterministic automaton derived from an [`OrderingLaw`].
///
/// `states`/`edges` mirror the `TransitionSystem` shape
/// (`states`/`transitions`/`final_states`) per spec §4, but this automaton
/// is *compiled* from the authored law, not discovered from a log.
#[derive(Debug, Clone, Default)]
pub struct CompiledLaw {
    /// State labels, indexed by `usize` state id. State `0` is the initial
    /// state before any activity has been observed (`"{}"`); the final
    /// entry (`dead_sink`) is `"DEAD"`.
    pub states: Vec<String>,
    /// `(from_state, activity) -> to_state` transition table. A missing
    /// entry means the activity is not a lawful continuation from
    /// `from_state` — callers must treat that as `dead_sink`.
    pub edges: HashMap<(usize, String), usize>,
    /// The absorbing DEAD sink state id.
    pub dead_sink: usize,
    /// `completable[state]` is true iff an accepting state is reachable
    /// from `state` without passing through `dead_sink`.
    pub completable: Vec<bool>,
    /// `accepting[state]` is true iff `state` already contains one of the
    /// law's `accepting` activities (i.e. is a TERMINAL state).
    pub accepting: Vec<bool>,
}
