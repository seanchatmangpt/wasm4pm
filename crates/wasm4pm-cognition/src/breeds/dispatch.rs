//! Breed dispatch: explicit, greppable string-match routing for every breed
//! id in the registry. Arms for breeds not implemented in this tree return
//! an "unsupported breed" error (the integrator unions arms across tiers).

use crate::breeds::{
    act_r::ActR, analogy_sme::AnalogySme, autoinstinct_learning::AutoinstinctLearning,
    autoinstinct_neurosis::AutoinstinctNeurosis, autoinstinct_semantics::AutoinstinctSemantics,
    autoinstinct_vision::AutoinstinctVision, cbr::Cbr, circumscription::Circumscription,
    ctl_check::CtlCheck, dendral::Dendral, episodic_memory::EpisodicMemory, frame::Eliza,
    gps::Gps, hearsay::Hearsay, ilp::Ilp, naive_physics::NaivePhysics, problog::Problog,
    production_rules::Mycin, prolog::Prolog, rl_symbolic::RlSymbolic, sat_cdcl::SatCdcl,
    situation_calculus::SituationCalculus, soar::Soar, strips::Strips, BreedInput, BreedOutput,
    CognitionBreed,
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
        "situation_calculus" => run_breed(&SituationCalculus, input),
        "circumscription" => run_breed(&Circumscription, input),
        "analogy_sme" => run_breed(&AnalogySme, input),
        "act_r" => run_breed(&ActR, input),
        "problog" => run_breed(&Problog, input),
        "sat_cdcl" => run_breed(&SatCdcl, input),
        "episodic_memory" => run_breed(&EpisodicMemory, input),
        "rl_symbolic" => run_breed(&RlSymbolic, input),
        "ctl_check" => run_breed(&CtlCheck, input),
        "ilp" => run_breed(&Ilp, input),
        "naive_physics" => run_breed(&NaivePhysics, input),
        "bayesian_network" => Err("unsupported breed: bayesian_network".to_string()),
        "fuzzy_logic" => Err("unsupported breed: fuzzy_logic".to_string()),
        "dempster_shafer" => Err("unsupported breed: dempster_shafer".to_string()),
        "abductive_lp" => Err("unsupported breed: abductive_lp".to_string()),
        "allen_temporal" => Err("unsupported breed: allen_temporal".to_string()),
        "description_logic" => Err("unsupported breed: description_logic".to_string()),
        "csp_ac3" => Err("unsupported breed: csp_ac3".to_string()),
        "ltl_monitor" => Err("unsupported breed: ltl_monitor".to_string()),
        "default_logic" => Err("unsupported breed: default_logic".to_string()),
        "htn_planning" => Err("unsupported breed: htn_planning".to_string()),
        "frames_inheritance" => Err("unsupported breed: frames_inheritance".to_string()),
        "ebl" => Err("unsupported breed: ebl".to_string()),
        "asp" => Err("unsupported breed: asp".to_string()),
        "abductive_ibe" => Err("unsupported breed: abductive_ibe".to_string()),
        "partial_order_plan" => Err("unsupported breed: partial_order_plan".to_string()),
        "event_calculus" => Err("unsupported breed: event_calculus".to_string()),
        "mdp" => Err("unsupported breed: mdp".to_string()),
        "version_space" => Err("unsupported breed: version_space".to_string()),
        "belief_merging" => Err("unsupported breed: belief_merging".to_string()),
        "qualitative_reason" => Err("unsupported breed: qualitative_reason".to_string()),
        "script_sam" => Err("unsupported breed: script_sam".to_string()),
        "clp" => Err("unsupported breed: clp".to_string()),
        "pomdp" => Err("unsupported breed: pomdp".to_string()),
        "markov_logic" => Err("unsupported breed: markov_logic".to_string()),
        "meta_reasoning" => Err("unsupported breed: meta_reasoning".to_string()),
        "construction_grammar" => Err("unsupported breed: construction_grammar".to_string()),
        "contingent_plan" => Err("unsupported breed: contingent_plan".to_string()),
        "tableaux" => Err("unsupported breed: tableaux".to_string()),
        "morphological" => Err("unsupported breed: morphological".to_string()),
        "triz" => Err("unsupported breed: triz".to_string()),
        "ocpm_route_discoverer" => Err("unsupported breed: ocpm_route_discoverer".to_string()),
        other => Err(format!("unknown breed: {}", other)),
    }
}
