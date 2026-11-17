use crate::breeds::{breed_instance, BreedId, BreedInput, BreedOutput, CognitionBreed};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

/// F1 provenance: one registry entry per dispatched run, keyed by output hash.
///
/// This is a forgery-DETECTION mechanism, not cryptographic unforgeability: a
/// breed (or adversary) that fabricates a `BreedOutput` post-hoc produces an
/// output whose hash has no registry entry issued during the oracle's call
/// window. It does not stop a hollow-but-dispatched trace (that is U2's job)
/// and does not stop a fully-compromised dispatch layer (oracles are
/// self-graded — see [`crate::breeds::support::oracle`] F2 docs).
#[derive(Debug, Clone)]
pub struct RunProvenance {
    /// Breed that ran.
    pub breed_id: String,
    /// BLAKE3 of the serialized `BreedInput`.
    pub input_hash: String,
    /// BLAKE3 of the serialized `BreedOutput` exactly as returned.
    pub output_hash: String,
    /// Global run-counter value at registration time. The oracle checks
    /// `nonce > counter-at-call-start` — the causal window.
    pub nonce: u64,
}

/// Bounded ring size (F1): ~4096 recent runs; older entries are evicted.
const PROVENANCE_RING_CAPACITY: usize = 4096;

static RUN_COUNTER: AtomicU64 = AtomicU64::new(0);
static PROVENANCE_RING: Mutex<VecDeque<RunProvenance>> = Mutex::new(VecDeque::new());

/// Current provenance counter — the oracle captures this before dispatching.
pub fn provenance_now() -> u64 {
    RUN_COUNTER.load(Ordering::Relaxed)
}

/// F1 check: does `output_hash` have a registry entry issued strictly after
/// `window_start`? Never blocks (U5 determinism safe — the registry is not
/// part of any serialization).
pub fn provenance_lookup(output_hash: &str, window_start: u64) -> bool {
    let ring = PROVENANCE_RING.lock().unwrap_or_else(|p| p.into_inner());
    ring.iter()
        .any(|e| e.output_hash == output_hash && e.nonce >= window_start)
}

fn register_provenance(breed_id: &str, input: &BreedInput, output: &BreedOutput) {
    let input_hash = blake3::hash(serde_json::to_string(input).unwrap_or_default().as_bytes())
        .to_hex()
        .to_string();
    let output_hash = blake3::hash(serde_json::to_string(output).unwrap_or_default().as_bytes())
        .to_hex()
        .to_string();
    let nonce = RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut ring = PROVENANCE_RING.lock().unwrap_or_else(|p| p.into_inner());
    if ring.len() >= PROVENANCE_RING_CAPACITY {
        ring.pop_front();
    }
    ring.push_back(RunProvenance {
        breed_id: breed_id.to_string(),
        input_hash,
        output_hash,
        nonce,
    });
}

/// Run a breed through its full lifecycle: preconditions → run → postconditions.
///
/// Enforces the `CognitionBreed` contract:
/// - `preconditions` must pass before execution begins (TPS fail-fast).
/// - `postconditions` must pass after execution (FM-5 fraud guard: empty
///   inference_trace is rejected as proof that real work did not occur).
/// - F5 fail-closed: a breed with no OCEL lifecycle model is refused.
/// - F1: every successful run registers {breed, input/output hashes, nonce}
///   in the bounded provenance ring.
pub fn run_breed(b: &dyn CognitionBreed, input: &BreedInput) -> Result<BreedOutput, String> {
    b.preconditions(input)
        .map_err(|e| format!("{}: precondition failed: {}", b.id(), e))?;
    let mut output = b
        .run(input)
        .map_err(|e| format!("{}: {}", e.breed, e.message))?;
    b.postconditions(input, &output)
        .map_err(|e| format!("{}: postcondition failed: {}", b.id(), e))?;

    // Derive OCEL and validate conformance (van der Aalst doctrine)
    let breed_id = b.id().to_string();
    let trace_str = serde_json::to_string(&output.inference_trace).unwrap_or_default();
    let tmp_run_id = blake3::hash(trace_str.as_bytes()).to_hex().to_string();
    let ocel_log = crate::ocel::derive_ocel(&breed_id, &tmp_run_id, &output.inference_trace);

    // F5 fail-closed: no lifecycle model → refuse. All 55 registered breeds
    // have models (P0–P5); this arm exists so a future registration cannot
    // silently bypass the OCEL gate.
    let model = crate::ocel::lifecycle_model_for(&breed_id).ok_or_else(|| {
        format!(
            "{}: no OCEL lifecycle model — refusing (fail-closed)",
            breed_id
        )
    })?;
    let conformance = crate::ocel::validate_ocel_alignment(&ocel_log, model);
    if !conformance.is_conforming {
        return Err(format!(
            "{}: OCEL conformance failure (fitness={:.3}): {}",
            breed_id,
            conformance.fitness,
            conformance.refusals.join("; ")
        ));
    }

    output.ocel_log = Some(serde_json::to_value(&ocel_log).unwrap_or(serde_json::Value::Null));

    // F1: register the run AFTER the output is final (ocel_log attached), so
    // the registered hash matches the hash the oracle computes.
    register_provenance(&breed_id, input, &output);

    Ok(output)
}

/// Dispatch to the correct breed's `run()` method.
///
/// Parses the breed string via `BreedId::from_str_id`, then routes through
/// `breed_instance` — the macro-generated match is compiler-checked for
/// exhaustiveness. Unknown/unsupported strings are caught before the match.
pub fn dispatch_breed(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    let id = BreedId::from_str_id(breed).ok_or_else(|| format!("unknown breed: {}", breed))?;
    run_breed(breed_instance(id), input)
}

/// Test harness: dispatch to the correct breed's `run()` method without OCEL or pre/post checks.
/// Usually used for unit tests of raw runs.
pub fn dispatch_breed_test(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    let id = BreedId::from_str_id(breed).ok_or_else(|| format!("unknown breed: {}", breed))?;
    breed_instance(id)
        .run(input)
        .map_err(|e| format!("{}: {}", e.breed, e.message))
}

/// Dispatch by `BreedId` through the macro-generated `breed_instance` routing
/// table — the single source of truth, compiler-checked for exhaustiveness.
/// Used by the oracle/adversary harness to run a breed by enum id.
pub fn dispatch_breed_id(
    id: crate::breeds::BreedId,
    input: &BreedInput,
) -> Result<BreedOutput, String> {
    run_breed(crate::breeds::breed_instance(id), input)
}

/// Test-harness dispatch by `BreedId`: routes through `breed_instance` and calls
/// `run()` directly (no preconditions / postconditions / OCEL gate). Used by the
/// oracle + ensemble harnesses for raw-run determinism and adversary checks.
pub fn dispatch_breed_test_id(
    id: crate::breeds::BreedId,
    input: &BreedInput,
) -> Result<BreedOutput, String> {
    crate::breeds::breed_instance(id)
        .run(input)
        .map_err(|e| format!("{}: {}", e.breed, e.message))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::BreedId;

    #[test]
    fn f1_real_dispatch_registers_provenance() {
        let input = BreedInput {
            intent: "i am flustrated because grindle hums at me".to_string(),
            ..Default::default()
        };
        let window_start = provenance_now();
        let out = dispatch_breed_id(BreedId::Eliza, &input).expect("eliza dispatch ok");
        let h = blake3::hash(serde_json::to_string(&out).unwrap_or_default().as_bytes())
            .to_hex()
            .to_string();
        assert!(
            provenance_lookup(&h, window_start),
            "real dispatch output hash must be registered within the call window"
        );
    }

    #[test]
    fn f1_fabricated_hash_has_no_registry_entry() {
        let fabricated = blake3::hash(b"fabricated-output").to_hex().to_string();
        assert!(
            !provenance_lookup(&fabricated, 0),
            "a fabricated output hash must have no registry entry"
        );
    }

    #[test]
    fn f5_all_registered_breeds_have_lifecycle_models() {
        let ids: &[&str] = &[
            "mycin", "hearsay", "cbr", "gps", "strips", "prolog", "soar", "eliza", "dendral",
            "autoinstinct_neurosis", "autoinstinct_vision", "autoinstinct_semantics",
            "autoinstinct_learning", "ltl_monitor", "allen_temporal", "fuzzy_logic",
            "bayesian_network", "htn_planning", "dempster_shafer", "csp_ac3", "default_logic",
            "frames_inheritance", "ebl", "asp", "abductive_ibe", "abductive_lp",
            "partial_order_plan", "event_calculus", "mdp", "version_space", "belief_merging",
            "qualitative_reason", "script_sam", "clp", "situation_calculus", "circumscription",
            "analogy_sme", "act_r", "problog", "sat_cdcl", "episodic_memory", "rl_symbolic",
            "ctl_check", "ilp", "naive_physics", "tableaux", "construction_grammar",
            "markov_logic", "pomdp", "contingent_plan", "meta_reasoning", "triz", "morphological",
            "ocpm_route_discoverer", "description_logic",
        ];
        assert_eq!(ids.len(), crate::breeds::BreedId::REGISTERED_COUNT);
        for id in ids {
            assert!(
                crate::ocel::lifecycle_model_for(id).is_some(),
                "breed '{}' has no lifecycle model (F5 fail-closed would refuse it)",
                id
            );
        }
    }
}
