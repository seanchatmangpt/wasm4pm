//! Breed dispatch: explicit string-match routing (greppable, audit-friendly).
//!
//! NOTE (P4 worktree): arms for breeds owned by other tiers' worktrees return
//! `Err("unsupported breed: …")` here; the integrator unions the real arms.

use crate::breeds::{
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    cbr::Cbr, construction_grammar::ConstructionGrammar, contingent_plan::ContingentPlan,
    dendral::Dendral, frame::Eliza, gps::Gps, hearsay::Hearsay, markov_logic::MarkovLogic,
    meta_reasoning::MetaReasoning, pomdp::Pomdp, production_rules::Mycin, prolog::Prolog,
    soar::Soar, strips::Strips, tableaux::Tableaux, BreedInput, BreedOutput, CognitionBreed,
};

/// Run a breed through its full lifecycle: preconditions → run → postconditions.
///
/// Enforces the `CognitionBreed` contract:
/// - `preconditions` must pass before execution begins (TPS fail-fast).
/// - `postconditions` must pass after execution (FM-5 fraud guard: empty
///   inference_trace is rejected as proof that real work did not occur).
pub fn run_breed(b: &dyn CognitionBreed, input: &BreedInput) -> Result<BreedOutput, String> {
    b.preconditions(input)
        .map_err(|e| format!("{}: precondition failed: {}", b.id(), e))?;
    let mut output = b
        .run(input)
        .map_err(|e| format!("{}: {}", e.breed, e.message))?;
    b.postconditions(&output)
        .map_err(|e| format!("{}: postcondition failed: {}", b.id(), e))?;

    // Derive OCEL and validate conformance (van der Aalst doctrine)
    let breed_id = format!("{}", b.id());
    let trace_str = serde_json::to_string(&output.inference_trace).unwrap_or_default();
    let tmp_run_id = blake3::hash(trace_str.as_bytes()).to_hex().to_string();
    let ocel_log = crate::ocel::derive_ocel(&breed_id, &tmp_run_id, &output.inference_trace);

    if let Some(model) = crate::ocel::lifecycle_model_for(&breed_id) {
        let conformance = crate::ocel::validate_ocel_alignment(&ocel_log, model);
        if !conformance.is_conforming {
            return Err(format!(
                "{}: OCEL conformance failure (fitness={:.3}): {}",
                breed_id,
                conformance.fitness,
                conformance.refusals.join("; ")
            ));
        }
    }

    output.ocel_log = Some(serde_json::to_value(&ocel_log).unwrap_or(serde_json::Value::Null));

    Ok(output)
}

/// Dispatch to the correct breed's `run()` method.
///
/// Each branch delegates to `run_breed`, which enforces pre- and post-conditions
/// so the empty-trace fraud signal is caught at the boundary.
pub fn dispatch_breed(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    match breed {
        "eliza" => run_breed(&Eliza, input),
        "cbr" => run_breed(&Cbr, input),
        "dendral" => run_breed(&Dendral, input),
        "strips" => run_breed(&Strips, input),
        "prolog" => run_breed(&Prolog, input),
        "mycin" => run_breed(&Mycin, input),
        "gps" => run_breed(&Gps, input),
        "soar" => run_breed(&Soar, input),
        "hearsay" => run_breed(&Hearsay, input),
        "autoinstinct_neurosis" => run_breed(&AutoinstinctNeurosis, input),
        "autoinstinct_semantics" => run_breed(&AutoinstinctSemantics, input),
        "autoinstinct_vision" => run_breed(&AutoinstinctVision, input),
        "autoinstinct_learning" => run_breed(&AutoinstinctLearning, input),
        "tableaux" => run_breed(&Tableaux, input),
        "construction_grammar" => run_breed(&ConstructionGrammar, input),
        "markov_logic" => run_breed(&MarkovLogic, input),
        "pomdp" => run_breed(&Pomdp, input),
        "contingent_plan" => run_breed(&ContingentPlan, input),
        "meta_reasoning" => run_breed(&MetaReasoning, input),
        "bayesian_network" | "fuzzy_logic" | "dempster_shafer" | "abductive_lp" | "ilp"
        | "allen_temporal" | "description_logic" | "csp_ac3" | "analogy_sme" | "ltl_monitor"
        | "default_logic" | "htn_planning" | "frames_inheritance" | "ebl" | "asp"
        | "abductive_ibe" | "partial_order_plan" | "event_calculus" | "mdp" | "version_space"
        | "belief_merging" | "qualitative_reason" | "script_sam" | "clp"
        | "situation_calculus" | "circumscription" | "act_r" | "problog" | "sat_cdcl"
        | "episodic_memory" | "rl_symbolic" | "ctl_check" | "naive_physics" | "morphological"
        | "triz" | "ocpm_route_discoverer" => Err(format!("unsupported breed: {}", breed)),
        other => Err(format!("unknown breed: {}", other)),
    }
}

/// Test harness: dispatch to the correct breed's `run()` method without OCEL or pre/post checks.
/// Usually used for unit tests of raw runs.
pub fn dispatch_breed_test(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    match breed {
        "eliza" => Eliza.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "cbr" => Cbr.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "dendral" => Dendral.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "strips" => Strips.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "prolog" => Prolog.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "mycin" => Mycin.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "gps" => Gps.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "soar" => Soar.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "hearsay" => Hearsay.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "autoinstinct_neurosis" => AutoinstinctNeurosis.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "autoinstinct_semantics" => AutoinstinctSemantics.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "autoinstinct_vision" => AutoinstinctVision.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "autoinstinct_learning" => AutoinstinctLearning.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "tableaux" => Tableaux.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "construction_grammar" => ConstructionGrammar.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "markov_logic" => MarkovLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "pomdp" => Pomdp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "contingent_plan" => ContingentPlan.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "meta_reasoning" => MetaReasoning.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "bayesian_network" | "fuzzy_logic" | "dempster_shafer" | "abductive_lp" | "ilp"
        | "allen_temporal" | "description_logic" | "csp_ac3" | "analogy_sme" | "ltl_monitor"
        | "default_logic" | "htn_planning" | "frames_inheritance" | "ebl" | "asp"
        | "abductive_ibe" | "partial_order_plan" | "event_calculus" | "mdp" | "version_space"
        | "belief_merging" | "qualitative_reason" | "script_sam" | "clp"
        | "situation_calculus" | "circumscription" | "act_r" | "problog" | "sat_cdcl"
        | "episodic_memory" | "rl_symbolic" | "ctl_check" | "naive_physics" | "morphological"
        | "triz" | "ocpm_route_discoverer" => Err(format!("unsupported breed: {}", breed)),
        other => Err(format!("unknown breed: {}", other)),
    }
}
