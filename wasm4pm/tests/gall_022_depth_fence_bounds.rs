//! GALL-021/022 admission bounds that must agree with replay.
//!
//! 1. Every POWL subject admitted at depth <= `MAX_POWL_DEPTH` lowers to a
//!    module whose `gall.powl.skeleton` section reads back through
//!    `inspect_module` (serde_json's 128-level recursion limit), in both the
//!    arena and the GALL-016 JSON dialect, for the worst-case nesting shapes
//!    (partial order and choice cost two JSON levels per POWL level).
//! 2. `MAX_POWL_DEPTH + 1` is a typed `PowlDepthExceeded`, not a serde error.
//! 3. `HostCapabilityFence` refuses unmodelled capability names at the parse
//!    boundary instead of dropping them (fail closed).
//! 4. Canonicalizing a wide, maximally deep model stays within a fixed time
//!    budget (canonical form is not re-hashed per nesting level).
//!
//! Real collaborators only: the real lowering, the real wasmparser inspection,
//! real serde parsing. No test doubles.

use std::time::{Duration, Instant};
use wasm4pm::gall_process_portability::{HostCapabilityFence, PortabilityRefusal, MAX_POWL_DEPTH};
use wasm4pm::gall_wasm_lowering::{inspect_module, lower_powl, PowlSubject};
use wasm4pm::powl_arena::{Operator, PowlArena};

/// `depth` counts POWL levels including the leaf task (root = level 1).
fn arena_chain(depth: usize, choice: bool) -> PowlSubject {
    let mut arena = PowlArena::new();
    let mut idx = arena.add_transition(Some("leaf".into()));
    for _ in 1..depth {
        idx = if choice {
            arena.add_operator(Operator::Xor, vec![idx])
        } else {
            arena.add_strict_partial_order(vec![idx])
        };
    }
    PowlSubject::from_arena(arena, idx).expect("admitted within MAX_POWL_DEPTH")
}

/// GALL-016 JSON chain; leaf is an object task (one extra JSON level).
fn gall016_chain(depth: usize, kind: &str) -> Vec<u8> {
    let mut json = String::from(r#"{"type":"task","id":"leaf"}"#);
    for _ in 1..depth {
        json = match kind {
            "hierarchy" => format!(r#"{{"type":"hierarchy","id":"h","child":{json}}}"#),
            other => format!(r#"{{"type":"{other}","children":[{json}]}}"#),
        };
    }
    json.into_bytes()
}

fn assert_replayable(subject: &PowlSubject) {
    let module = lower_powl(subject).expect("lowering");
    let inspection = inspect_module(&module)
        .unwrap_or_else(|e| panic!("admitted subject's module does not read back: {e:?}"));
    assert_eq!(
        inspection.skeleton.as_ref(),
        Some(subject.skeleton()),
        "skeleton read from module bytes differs from the admitted subject"
    );
    assert_eq!(inspection.subject.source_digest, subject.source_digest());
}

#[test]
fn gall_022_max_depth_arena_subjects_replay_from_module_bytes() {
    assert_replayable(&arena_chain(MAX_POWL_DEPTH, false));
    assert_replayable(&arena_chain(MAX_POWL_DEPTH, true));
}

#[test]
fn gall_022_max_depth_gall016_json_parses_and_replays() {
    for kind in ["partial_order", "choice", "sequence", "hierarchy"] {
        let bytes = gall016_chain(MAX_POWL_DEPTH, kind);
        let subject = PowlSubject::from_gall016_json(&bytes)
            .unwrap_or_else(|e| panic!("{kind} at MAX_POWL_DEPTH refused: {e:?}"));
        assert_replayable(&subject);
    }
}

#[test]
fn gall_022_depth_beyond_bound_is_typed_refusal_in_both_dialects() {
    let mut arena = PowlArena::new();
    let mut idx = arena.add_transition(Some("leaf".into()));
    for _ in 0..MAX_POWL_DEPTH {
        idx = arena.add_strict_partial_order(vec![idx]);
    }
    assert_eq!(
        PowlSubject::from_arena(arena, idx).unwrap_err(),
        PortabilityRefusal::PowlDepthExceeded
    );
    for kind in ["partial_order", "choice", "hierarchy"] {
        assert_eq!(
            PowlSubject::from_gall016_json(&gall016_chain(MAX_POWL_DEPTH + 1, kind)).unwrap_err(),
            PortabilityRefusal::PowlDepthExceeded,
            "{kind} one level past the bound"
        );
    }
}

#[test]
fn gall_021_host_fence_refuses_unmodelled_capabilities_at_parse() {
    for extra in [
        r#"{"clock":false,"environment":true}"#,
        r#"{"threads":true}"#,
    ] {
        assert!(
            serde_json::from_str::<HostCapabilityFence>(extra).is_err(),
            "unmodelled capability admitted: {extra}"
        );
    }
    let known: HostCapabilityFence =
        serde_json::from_str(r#"{"clock":true,"randomness":false}"#).unwrap();
    assert!(known.clock && !known.randomness && !known.filesystem && !known.network);
}

#[test]
fn gall_022_wide_max_depth_canonicalization_is_bounded() {
    // MAX_POWL_DEPTH levels of partial orders, each holding 40 concurrent
    // tasks plus the next level: ~2.5k nodes at the deepest admitted nesting.
    let mut arena = PowlArena::new();
    let mut idx = arena.add_transition(Some("t0".into()));
    for level in 1..MAX_POWL_DEPTH {
        let mut children = vec![idx];
        for k in 0..40 {
            children.push(arena.add_transition(Some(format!("t{}", (level * 7 + k) % 200))));
        }
        idx = arena.add_strict_partial_order(children);
    }
    let start = Instant::now();
    let subject = PowlSubject::from_arena(arena, idx).expect("admitted");
    let elapsed = start.elapsed();
    assert!(!subject.source_digest().is_empty());
    assert!(
        elapsed < Duration::from_secs(5),
        "canonicalization took {elapsed:?}"
    );
}

#[test]
fn gall_022_depth_prescan_ignores_brackets_inside_strings() {
    let id = format!("{}\\\"{}", "[".repeat(300), "{".repeat(300));
    let bytes = format!(r#"{{"type":"sequence","children":["{id}","b"]}}"#);
    let subject = PowlSubject::from_gall016_json(bytes.as_bytes())
        .unwrap_or_else(|e| panic!("bracket-laden task id refused: {e:?}"));
    assert_eq!(subject.alphabet().len(), 2);
    assert_replayable(&subject);
}
