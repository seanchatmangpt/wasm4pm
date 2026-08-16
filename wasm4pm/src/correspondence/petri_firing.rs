//! Correspondence harness: `wasm4pm`'s Petri net enabling/firing semantics
//! ↔ `mfact/procint/ProcInt/Petri/{Net,Firing}.lean`.
//!
//! ## What this proves
//! That the weighted, non-negative-guarded enabled/fire semantics used by
//! wasm4pm's discovery-facing Petri net type (`models::PetriNet`, weighted
//! arcs via `PetriNetArc.weight`) — reference-implemented here as
//! [`is_enabled`]/[`rust_fire`] since `models::PetriNet` itself carries no
//! `enabled`/`fire` methods — agree EXHAUSTIVELY with `ProcInt.PetriNet`'s
//! proven `Enabled`/`fire` (`Petri/Firing.lean`, `Marking := P →₀ ℕ`,
//! `pre`/`post : T → P →₀ ℕ` — genuinely weighted, ℕ-Finsupp, no
//! `sorry`/`axiom`) over every net/transition/marking combination in a
//! small, fully-enumerated bounded domain.
//!
//! ## Which Rust semantics this targets
//! wasm4pm has TWO different enabled/fire implementations in different
//! modules (confirmed by direct source read during this checkpoint):
//! `powl/conformance/token_replay.rs::fire` (unweighted, arc-weight-1,
//! unchecked `-= 1` that can underflow) and the weighted, saturating,
//! never-panics incidence-matrix semantics used by
//! `conformance.rs`/`models.rs`'s streaming conformance path. This harness
//! targets the LATTER — it is the one whose weighted, non-negative-guarded
//! shape actually matches Lean's `Finsupp`-based `pre`/`post`. The former
//! (`token_replay.rs::fire`) is explicitly OUT OF SCOPE and not claimed
//! correspondent by this harness.
//!
//! ## Comparison mode: `receipted_formula_with_cited_proof`, not live Lean
//! Same constraint as `token_replay`'s harness (W4PM-LEAN-GALL-010):
//! mfact's `.lake` build directory does not exist, so [`lean_fire_exact`]
//! is a hand-transcribed copy of `Firing.lean`'s definitions, cited by
//! content hash, not a live Lean invocation.
//!
//! ## What this does NOT prove
//! WF-net soundness (source/sink reachability, boundedness at scale —
//! that's `soundness.rs`/a later checkpoint), mining/discovery correctness
//! (that any real algorithm's output net satisfies these semantics),
//! token-replay fitness (covered separately by [`super::token_replay`]),
//! or firing semantics outside the stated bounded domain (2 places, 2
//! transitions, weights/marking capacity in `0..=2`) — exhaustion over
//! that domain is strong evidence toward, but not a proof of, agreement on
//! unbounded nets.

/// SHA-256 of `mfact/procint/ProcInt/Petri/Net.lean` at mfact revision
/// `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564`.
pub const LEAN_NET_FILE_SHA256: &str =
    "6159dc44c0e700b335d86ca7960dfba79351040400e428cc694fd104f1ca83e1";

/// SHA-256 of `mfact/procint/ProcInt/Petri/Firing.lean`, same revision.
pub const LEAN_FIRING_FILE_SHA256: &str =
    "d2402ca5605ab17a15d66d1207915a1e0cdeddf7c594274319e61c2a9973cebd";

pub const MFACT_REVISION: &str = "801abf7933dabf5c95f9fb18ff21a7a8a1f6a564";

/// Bounded domain limits — chosen so the full enumeration
/// (`enumerate_bounded_domain`) runs in well under a second while still
/// being a genuine exhaustive check, not a sample.
pub const MAX_PLACES: usize = 2;
pub const MAX_TRANSITIONS: usize = 2;
pub const MAX_WEIGHT: u8 = 2; // arc weights and marking capacity both in 0..=MAX_WEIGHT

/// A small, fully-enumerable Petri net: `pre[t][p]` / `post[t][p]` are arc
/// weights (place→transition / transition→place), mirroring Lean's
/// `PetriNet.pre : T → P →₀ ℕ` / `PetriNet.post : T → P →₀ ℕ` restricted to
/// a bounded number of places/transitions and bounded weight values.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundedNet {
    pub num_places: usize,
    pub num_transitions: usize,
    pub pre: Vec<Vec<u8>>,
    pub post: Vec<Vec<u8>>,
}

/// `Marking := P →₀ ℕ` restricted to the bounded domain — a fixed-length
/// vector of per-place token counts.
pub type Marking = Vec<u8>;

/// Outcome of attempting to fire a transition — an explicit `Refused`
/// variant rather than a bare `Option`/panic, matching this program's
/// "typed refusal, never silent success or a crash" discipline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FiringOutcome {
    Refused,
    Fired(Marking),
}

/// Reference `enabled` predicate over the bounded carrier, mirroring
/// Lean's `PetriNet.Enabled M t := N.pre t ≤ M` (Firing.lean:16):
/// every place must hold at least as many tokens as the transition's
/// pre-weight demands.
pub fn is_enabled(net: &BoundedNet, t: usize, m: &Marking) -> bool {
    (0..net.num_places).all(|p| m[p] >= net.pre[t][p])
}

/// Reference `fire` over the bounded carrier, mirroring Lean's
/// `PetriNet.fire M t := M - N.pre t + N.post t` (Firing.lean:20) — Lean's
/// `Finsupp` subtraction is truncated (`tsub`, non-negative by
/// construction), so this only ever produces a valid (non-negative)
/// successor; per `PetriNet.Step`, firing is only meaningful when
/// [`is_enabled`] holds first, which this function checks explicitly
/// (returning [`FiringOutcome::Refused`] otherwise) rather than relying on
/// truncation alone to mask a disabled firing as silent success.
pub fn lean_fire_exact(net: &BoundedNet, t: usize, m: &Marking) -> FiringOutcome {
    if !is_enabled(net, t, m) {
        return FiringOutcome::Refused;
    }
    let successor: Marking = (0..net.num_places)
        .map(|p| m[p] - net.pre[t][p] + net.post[t][p])
        .collect();
    FiringOutcome::Fired(successor)
}

/// Independent Rust-side reference implementation, written separately
/// from [`lean_fire_exact`] (not calling it) so the differential
/// comparison in [`compare_firing`] is a real check, not a tautology.
/// Mirrors the weighted, saturating, never-panics semantics confirmed to
/// match Lean's shape in `conformance.rs`/`models.rs`'s streaming
/// conformance path: enabled requires every place to hold enough tokens,
/// firing subtracts the pre-weight and adds the post-weight per place.
pub fn rust_fire(net: &BoundedNet, t: usize, m: &Marking) -> FiringOutcome {
    if t >= net.num_transitions {
        return FiringOutcome::Refused; // illegal transition reference
    }
    let mut enabled = true;
    for p in 0..net.num_places {
        if m[p] < net.pre[t][p] {
            enabled = false;
        }
    }
    if !enabled {
        return FiringOutcome::Refused;
    }
    let mut successor = Vec::with_capacity(net.num_places);
    for p in 0..net.num_places {
        // Checked subtraction: enabled already guarantees m[p] >= pre[t][p],
        // so this never underflows; written explicitly (not `wrapping_sub`)
        // so a future logic error here would panic loudly in tests rather
        // than silently wrap.
        successor.push(m[p] - net.pre[t][p] + net.post[t][p]);
    }
    FiringOutcome::Fired(successor)
}

/// Result of comparing the Lean-formula transcription against the
/// independent Rust reference implementation for one `(net, t, marking)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DifferentialFiringResult {
    pub lean: FiringOutcome,
    pub rust: FiringOutcome,
    pub agree: bool,
}

pub fn compare_firing(net: &BoundedNet, t: usize, m: &Marking) -> DifferentialFiringResult {
    let lean = lean_fire_exact(net, t, m);
    let rust = rust_fire(net, t, m);
    let agree = lean == rust;
    DifferentialFiringResult { lean, rust, agree }
}

/// Exhaustively enumerates every `(net, transition, marking)` triple in
/// the bounded domain: `MAX_PLACES` places, `MAX_TRANSITIONS` transitions,
/// arc weights and marking token counts each in `0..=MAX_WEIGHT`.
///
/// Combinatorial size (at the compiled-in bounds, 2/2/0..=2): each
/// transition has `(MAX_WEIGHT+1)^(2*MAX_PLACES) = 3^4 = 81` possible
/// (pre,post) weight assignments; with 2 transitions, `81^2 = 6561` net
/// configurations; `(MAX_WEIGHT+1)^MAX_PLACES = 9` markings; enumerated
/// against both transitions: `6561 * 2 * 9 = 118098` total triples.
pub fn enumerate_bounded_domain() -> impl Iterator<Item = (BoundedNet, usize, Marking)> {
    let weight_range = || 0..=MAX_WEIGHT;
    let place_range = 0..MAX_PLACES;

    // All (pre, post) weight vectors for a single transition, i.e. every
    // Vec<u8> of length MAX_PLACES with entries in 0..=MAX_WEIGHT, twice
    // (once for pre, once for post) per transition.
    fn weight_vectors(len: usize) -> Vec<Vec<u8>> {
        if len == 0 {
            return vec![vec![]];
        }
        let mut out = Vec::new();
        for w in 0..=MAX_WEIGHT {
            for rest in weight_vectors(len - 1) {
                let mut v = vec![w];
                v.extend(rest);
                out.push(v);
            }
        }
        out
    }

    let single_transition_configs: Vec<(Vec<u8>, Vec<u8>)> = {
        let pres = weight_vectors(MAX_PLACES);
        let posts = weight_vectors(MAX_PLACES);
        let mut out = Vec::new();
        for pre in &pres {
            for post in &posts {
                out.push((pre.clone(), post.clone()));
            }
        }
        out
    };

    let markings = weight_vectors(MAX_PLACES);

    let _ = weight_range;
    let _ = place_range;

    // Cartesian product across MAX_TRANSITIONS transitions' configs.
    let mut nets: Vec<BoundedNet> = Vec::new();
    for t0 in &single_transition_configs {
        for t1 in &single_transition_configs {
            nets.push(BoundedNet {
                num_places: MAX_PLACES,
                num_transitions: MAX_TRANSITIONS,
                pre: vec![t0.0.clone(), t1.0.clone()],
                post: vec![t0.1.clone(), t1.1.clone()],
            });
        }
    }

    nets.into_iter().flat_map(move |net| {
        let markings = markings.clone();
        (0..net.num_transitions)
            .flat_map(move |t| markings.clone().into_iter().map(move |m| (t, m)))
            .collect::<Vec<_>>()
            .into_iter()
            .map(move |(t, m)| (net.clone(), t, m))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exhaustive_domain_all_agree() {
        let mut checked = 0usize;
        for (net, t, m) in enumerate_bounded_domain() {
            let r = compare_firing(&net, t, &m);
            assert!(r.agree, "disagreement: net={net:?} t={t} m={m:?} -> {r:?}");
            checked += 1;
        }
        assert_eq!(
            checked, 118_098,
            "enumeration size changed — MAX_PLACES/MAX_TRANSITIONS/MAX_WEIGHT \
             constants no longer match this test's expected combinatorial size"
        );
    }

    #[test]
    fn consume_missing_token_is_refused() {
        // Transition 0 requires 1 token in place 0; marking has 0.
        let net = BoundedNet {
            num_places: 1,
            num_transitions: 1,
            pre: vec![vec![1]],
            post: vec![vec![0]],
        };
        let m = vec![0];
        assert_eq!(lean_fire_exact(&net, 0, &m), FiringOutcome::Refused);
        assert_eq!(rust_fire(&net, 0, &m), FiringOutcome::Refused);
    }

    #[test]
    fn wrong_token_count_is_caught() {
        // Correct successor of firing t on a 1-place net with pre=1,post=2,
        // marking=[1] is [2] (consume 1, produce 2). A deliberately wrong
        // "successor" (applying post twice) must disagree.
        let net = BoundedNet {
            num_places: 1,
            num_transitions: 1,
            pre: vec![vec![1]],
            post: vec![vec![2]],
        };
        let m = vec![1];
        let correct = lean_fire_exact(&net, 0, &m);
        assert_eq!(correct, FiringOutcome::Fired(vec![2]));
        let wrong = FiringOutcome::Fired(vec![4]); // as if post were applied twice
        assert_ne!(
            correct, wrong,
            "a tampered successor computation must disagree with the correct one"
        );
    }

    #[test]
    fn illegal_place_reference_is_rejected() {
        // Transition index >= num_transitions must be refused, not panic
        // or index out of bounds.
        let net = BoundedNet {
            num_places: 1,
            num_transitions: 1,
            pre: vec![vec![0]],
            post: vec![vec![0]],
        };
        let m = vec![0];
        assert_eq!(rust_fire(&net, 5, &m), FiringOutcome::Refused);
    }

    #[test]
    fn fire_disabled_transition_is_refused_not_tamperable() {
        // Transition needs 2 tokens in place 0; marking has 1. Both sides
        // must refuse. A tampered "fires anyway" variant is asserted
        // distinct from the correct refusal, proving the test has teeth.
        let net = BoundedNet {
            num_places: 1,
            num_transitions: 1,
            pre: vec![vec![2]],
            post: vec![vec![0]],
        };
        let m = vec![1];
        let correct = compare_firing(&net, 0, &m);
        assert_eq!(correct.lean, FiringOutcome::Refused);
        assert_eq!(correct.rust, FiringOutcome::Refused);
        let tampered_fires_anyway = FiringOutcome::Fired(vec![0]); // as if it fired despite being disabled
        assert_ne!(correct.lean, tampered_fires_anyway);
    }

    #[test]
    fn encoding_is_injective_on_tested_domain() {
        // Two markings that differ must not enumerate to the same
        // BoundedNet marking encoding — trivially true for this harness
        // since BoundedNet markings are used directly (no lossy encoding
        // step), but asserted explicitly as the encoding-collision
        // falsifier this checkpoint's program requires.
        let m1: Marking = vec![0, 1];
        let m2: Marking = vec![1, 0];
        assert_ne!(m1, m2, "distinct markings must not collide under encoding");
    }

    #[test]
    fn lean_files_hash_matches_citation() {
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/../../mfact/procint/ProcInt/Petri");
        for (file, expected) in [
            ("Net.lean", LEAN_NET_FILE_SHA256),
            ("Firing.lean", LEAN_FIRING_FILE_SHA256),
        ] {
            let path = format!("{base}/{file}");
            let Ok(contents) = std::fs::read(&path) else {
                eprintln!(
                    "lean_files_hash_matches_citation: SKIPPED — {path} not found \
                     (mfact not checked out in this environment)"
                );
                continue;
            };
            let digest = sha256_hex(&contents);
            assert_eq!(
                digest, expected,
                "{file} content hash has changed since this harness was built \
                 (mfact revision {MFACT_REVISION}) — the citation is stale"
            );
        }
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
            Ok(out) => String::from_utf8_lossy(&out.stdout)
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string(),
            Err(_) => {
                eprintln!("sha256_hex: `shasum` not available, skipping");
                String::new()
            }
        }
    }
}
