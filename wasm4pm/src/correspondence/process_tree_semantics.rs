//! Correspondence harness: a restricted subset of wasm4pm's
//! `ProcessTreeOperator` (`Sequence`, `ExclusiveChoice`, `Parallel`, all
//! binary) ↔ `mfact/procint/ProcInt/Models/ProcessTree.lean`'s trace
//! language (`ProcessTree.language`).
//!
//! ## Why this is the largest, most heavily-scoped-down checkpoint so far
//! Prior audit rounds found: `mfw`'s `Crown/POWLBridge.lean` is proven but
//! **fully abstract** (generic over an opaque `WorkflowSpace α` with no
//! real POWL operators — the theorem could equally be named for BPMN or
//! YAWL). `mfact` has TWO separate, non-agreeing files: `Models/Powl.lean`
//! (n-ary `xor`/`po` with a `WellFormed` side-condition, but **no
//! `language` function** — no trace semantics proven for it at all) and
//! `Models/ProcessTree.lean` (binary `leaf/silent/seq/xor/par/loop`, WITH
//! a proven `language` function, no `sorry`/`axiom`). `mfw` and `mfact`
//! never reference each other. This checkpoint bridges wasm4pm directly
//! to **`ProcessTree.lean` only** — the POWL-vs-not-POWL disagreement is
//! sidestepped entirely, matching how 010-014 each bridged to one
//! specific proven Lean file, not an aspirational unification.
//!
//! ## Scope: Sequence, ExclusiveChoice, Parallel — binary, acyclic only
//! wasm4pm's `ProcessTreeOperator` (`process_tree.rs:116-143`) is n-ary at
//! the type level (`children: Vec<ProcessTree>`) and includes `Loop`
//! (binary by construction convention only — `debug_assert!`, not a type
//! invariant) and `Or` (an IMf extension "not in the original Leemans et
//! al. 2013 paper"). This harness restricts to a `RestrictedTree` carrier
//! that is:
//! - **binary only** (matching `ProcessTree.lean`'s `seq l r`/`xor l
//!   r`/`par l r` constructors exactly — no n-ary desugaring built this
//!   pass, deferred to 015B along with the associativity/language-
//!   preservation proof that desugaring would require),
//! - **`Or`-free** (confirmed by a prior audit round: real wasm4pm
//!   discovery/conversion code paths — `inductive_miner_recursive`,
//!   `powl/conversion/to_process_tree.rs` — never construct `Or`; it has
//!   zero call sites outside `process_tree.rs` itself and its own unit
//!   test, i.e. it is dead code from the miner's perspective, not merely
//!   an inconvenient case to exclude),
//! - **`Loop`-free** — the governing program explicitly requires
//!   bisimulation or automata-language equivalence for cyclic structures,
//!   not a bounded trace sample; `Loop`'s trace language
//!   (`LoopLang`, body then zero-or-more `(redo ++ body)` rounds) is
//!   genuinely infinite for nontrivial body/redo, so exhaustive
//!   finite-trace enumeration cannot honestly cover it. Deferred to 015B.
//!
//! ## Comparison mode: `receipted_formula_with_cited_proof`, not live Lean
//! Same constraint as every prior harness — mfact's `.lake` build
//! directory does not exist. [`lean_language_exact`] is a hand-transcribed
//! copy of `ProcessTree.language`'s literal definition for the seq/xor/par
//! cases, cited by content hash.
//!
//! ## Method: exhaustive trace-language enumeration, not sampling
//! Per the program's own requirement for acyclic structures. All
//! `RestrictedTree` shapes with up to [`MAX_LEAVES`] leaves, built from
//! `Sequence`/`ExclusiveChoice`/`Parallel` over a small alphabet, are
//! enumerated; for each, the full trace language (a finite set, since no
//! `Loop` is present) is computed both ways and compared for exact set
//! equality — not a bounded sample of traces.

use std::collections::BTreeSet;

pub const LEAN_PROCESS_TREE_FILE_SHA256: &str =
    "00c76db7a3391ccf0dc5eb1346f29dd6e2e097564e8f549d22453348839935e0";
pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

pub const MAX_LEAVES: usize = 3;

/// A binary process tree restricted to the three in-scope operators.
/// Leaves are small integers (0..alphabet size) standing in for activity
/// names — the trace-language comparison doesn't depend on activity
/// identity, only on structural equality of traces.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RestrictedTree {
    Leaf(u8),
    Seq(Box<RestrictedTree>, Box<RestrictedTree>),
    Xor(Box<RestrictedTree>, Box<RestrictedTree>),
    Par(Box<RestrictedTree>, Box<RestrictedTree>),
}

type Trace = Vec<u8>;
type Language = BTreeSet<Trace>;

/// Standard shuffle/interleaving of two traces, preserving each trace's
/// internal relative order — mirrors `ProcessTree.lean:26-32`'s
/// `interleavings` exactly (same recursive structure: base cases when
/// either side is empty, recursive case picks the next element from
/// either side).
fn interleavings(xs: &[u8], ys: &[u8]) -> Vec<Trace> {
    if xs.is_empty() {
        return vec![ys.to_vec()];
    }
    if ys.is_empty() {
        return vec![xs.to_vec()];
    }
    let mut out = Vec::new();
    for w in interleavings(&xs[1..], ys) {
        let mut v = vec![xs[0]];
        v.extend(w);
        out.push(v);
    }
    for w in interleavings(xs, &ys[1..]) {
        let mut v = vec![ys[0]];
        v.extend(w);
        out.push(v);
    }
    out
}

/// `seqLang A B := { u ++ v | u ∈ A, v ∈ B }` (`ProcessTree.lean:36-37`).
fn seq_lang(a: &Language, b: &Language) -> Language {
    let mut out = Language::new();
    for u in a {
        for v in b {
            let mut w = u.clone();
            w.extend(v);
            out.insert(w);
        }
    }
    out
}

/// Hand-transcribed from `ProcessTree.language`'s literal definition
/// (`ProcessTree.lean:49-55`), restricted to the leaf/seq/xor/par cases
/// (silent/loop excluded — silent is unused by `RestrictedTree`, loop is
/// out of scope per this module's doc comment).
pub fn lean_language_exact(t: &RestrictedTree) -> Language {
    match t {
        RestrictedTree::Leaf(a) => {
            let mut s = Language::new();
            s.insert(vec![*a]);
            s
        }
        RestrictedTree::Seq(l, r) => seq_lang(&lean_language_exact(l), &lean_language_exact(r)),
        RestrictedTree::Xor(l, r) => {
            let mut s = lean_language_exact(l);
            s.extend(lean_language_exact(r));
            s
        }
        RestrictedTree::Par(l, r) => {
            let ll = lean_language_exact(l);
            let lr = lean_language_exact(r);
            let mut out = Language::new();
            for u in &ll {
                for v in &lr {
                    for w in interleavings(u, v) {
                        out.insert(w);
                    }
                }
            }
            out
        }
    }
}

/// Independent Rust reference implementation of the same trace-language
/// computation, written separately (not calling [`lean_language_exact`])
/// so the differential comparison in [`compare_language`] is meaningful
/// — a real second implementation, not a tautology. Structured
/// differently on purpose (iterative interleaving construction below vs.
/// the Lean-mirroring recursive style above) to avoid accidentally
/// sharing a bug.
pub fn rust_language(t: &RestrictedTree) -> Language {
    fn interleave_iter(xs: &[u8], ys: &[u8]) -> Vec<Trace> {
        if xs.is_empty() && ys.is_empty() {
            return vec![vec![]];
        }
        let mut results = Vec::new();
        if !xs.is_empty() {
            for rest in interleave_iter(&xs[1..], ys) {
                let mut v = Vec::with_capacity(rest.len() + 1);
                v.push(xs[0]);
                v.extend(rest);
                results.push(v);
            }
        }
        if !ys.is_empty() {
            for rest in interleave_iter(xs, &ys[1..]) {
                let mut v = Vec::with_capacity(rest.len() + 1);
                v.push(ys[0]);
                v.extend(rest);
                results.push(v);
            }
        }
        results
    }

    match t {
        RestrictedTree::Leaf(a) => BTreeSet::from([vec![*a]]),
        RestrictedTree::Seq(l, r) => {
            let ll = rust_language(l);
            let lr = rust_language(r);
            let mut out = Language::new();
            for u in &ll {
                for v in &lr {
                    let mut w = u.clone();
                    w.extend(v);
                    out.insert(w);
                }
            }
            out
        }
        RestrictedTree::Xor(l, r) => {
            let mut out = rust_language(l);
            out.extend(rust_language(r));
            out
        }
        RestrictedTree::Par(l, r) => {
            let ll = rust_language(l);
            let lr = rust_language(r);
            let mut out = Language::new();
            for u in &ll {
                for v in &lr {
                    out.extend(interleave_iter(u, v));
                }
            }
            out
        }
    }
}

#[derive(Debug, Clone)]
pub struct DifferentialLanguageResult {
    pub lean: Language,
    pub rust: Language,
    pub agree: bool,
}

pub fn compare_language(t: &RestrictedTree) -> DifferentialLanguageResult {
    let lean = lean_language_exact(t);
    let rust = rust_language(t);
    let agree = lean == rust;
    DifferentialLanguageResult { lean, rust, agree }
}

/// Exhaustively enumerates every `RestrictedTree` shape with up to
/// [`MAX_LEAVES`] leaves, using a 2-symbol alphabet `{0, 1}` (sufficient
/// to distinguish sequence order and choice/concurrency branching — a
/// larger alphabet would only grow the trace vocabulary, not the
/// structural coverage).
pub fn enumerate_trees(max_leaves: usize) -> Vec<RestrictedTree> {
    fn trees_with_n_leaves(n: usize, alphabet: &[u8]) -> Vec<RestrictedTree> {
        if n == 1 {
            return alphabet.iter().map(|&a| RestrictedTree::Leaf(a)).collect();
        }
        let mut out = Vec::new();
        for left_n in 1..n {
            let right_n = n - left_n;
            let lefts = trees_with_n_leaves(left_n, alphabet);
            let rights = trees_with_n_leaves(right_n, alphabet);
            for l in &lefts {
                for r in &rights {
                    out.push(RestrictedTree::Seq(Box::new(l.clone()), Box::new(r.clone())));
                    out.push(RestrictedTree::Xor(Box::new(l.clone()), Box::new(r.clone())));
                    out.push(RestrictedTree::Par(Box::new(l.clone()), Box::new(r.clone())));
                }
            }
        }
        out
    }

    let alphabet = [0u8, 1u8];
    let mut all = Vec::new();
    for n in 1..=max_leaves {
        all.extend(trees_with_n_leaves(n, &alphabet));
    }
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exhaustive_small_trees_all_agree() {
        let trees = enumerate_trees(MAX_LEAVES);
        assert!(!trees.is_empty());
        let mut checked = 0usize;
        for t in &trees {
            let r = compare_language(t);
            assert!(r.agree, "disagreement on tree {t:?}: lean={:?} rust={:?}", r.lean, r.rust);
            checked += 1;
        }
        eprintln!("exhaustive_small_trees_all_agree: checked {checked} trees (MAX_LEAVES={MAX_LEAVES})");
    }

    #[test]
    fn sequence_is_concatenation() {
        let t = RestrictedTree::Seq(Box::new(RestrictedTree::Leaf(0)), Box::new(RestrictedTree::Leaf(1)));
        let lang = lean_language_exact(&t);
        assert_eq!(lang, BTreeSet::from([vec![0, 1]]));
    }

    #[test]
    fn exclusive_choice_is_union() {
        let t = RestrictedTree::Xor(Box::new(RestrictedTree::Leaf(0)), Box::new(RestrictedTree::Leaf(1)));
        let lang = lean_language_exact(&t);
        assert_eq!(lang, BTreeSet::from([vec![0], vec![1]]));
    }

    #[test]
    fn parallel_is_all_interleavings() {
        let t = RestrictedTree::Par(Box::new(RestrictedTree::Leaf(0)), Box::new(RestrictedTree::Leaf(1)));
        let lang = lean_language_exact(&t);
        assert_eq!(lang, BTreeSet::from([vec![0, 1], vec![1, 0]]));
    }

    #[test]
    fn wrong_language_is_caught() {
        // Negative falsifier: a tampered "sequence" that (incorrectly)
        // includes the reversed order must disagree with the real
        // sequence semantics (sequence is NOT commutative, unlike
        // exclusive choice/parallel's union/interleaving).
        let t = RestrictedTree::Seq(Box::new(RestrictedTree::Leaf(0)), Box::new(RestrictedTree::Leaf(1)));
        let correct = lean_language_exact(&t);
        let tampered_commutative = BTreeSet::from([vec![0, 1], vec![1, 0]]);
        assert_ne!(correct, tampered_commutative, "sequence must not be commutative like xor/par are");
    }

    #[test]
    fn lean_file_hash_matches_citation() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../mfact/procint/ProcInt/Models/ProcessTree.lean");
        let Ok(contents) = std::fs::read(path) else {
            eprintln!("lean_file_hash_matches_citation: SKIPPED — {path} not found (mfact not checked out)");
            return;
        };
        let digest = sha256_hex(&contents);
        assert_eq!(
            digest, LEAN_PROCESS_TREE_FILE_SHA256,
            "ProcessTree.lean content hash has changed since this harness was built \
             (mfact revision {MFACT_REVISION}) — the citation is stale"
        );
    }

    fn sha256_hex(data: &[u8]) -> String {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let output = Command::new("shasum")
            .arg("-a")
            .arg("256")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                child.stdin.take().unwrap().write_all(data).expect("write to shasum stdin");
                child.wait_with_output()
            });
        match output {
            Ok(out) => String::from_utf8_lossy(&out.stdout).split_whitespace().next().unwrap_or("").to_string(),
            Err(_) => {
                eprintln!("sha256_hex: `shasum` not available, skipping");
                String::new()
            }
        }
    }
}
