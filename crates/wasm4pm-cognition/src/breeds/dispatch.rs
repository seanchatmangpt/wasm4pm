use crate::breeds::{
    abductive_ibe::AbductiveIbe, abductive_lp::AbductiveLp, asp::Asp,
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    belief_merging::BeliefMerging, cbr::Cbr, clp::Clp, dendral::Dendral,
    description_logic::DescriptionLogic, event_calculus::EventCalculus, frame::Eliza, gps::Gps,
    hearsay::Hearsay, mdp::Mdp, partial_order_plan::PartialOrderPlan, production_rules::Mycin,
    prolog::Prolog, qualitative_reason::QualitativeReason, script_sam::ScriptSam, soar::Soar,
    strips::Strips, version_space::VersionSpace, BreedInput, BreedOutput, CognitionBreed,
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
        "bayesian_network" => Err("unsupported breed: bayesian_network".to_string()),
        "fuzzy_logic" => Err("unsupported breed: fuzzy_logic".to_string()),
        "dempster_shafer" => Err("unsupported breed: dempster_shafer".to_string()),
        "abductive_lp" => run_breed(&AbductiveLp, input),
        "ilp" => Err("unsupported breed: ilp".to_string()),
        "allen_temporal" => Err("unsupported breed: allen_temporal".to_string()),
        "description_logic" => run_breed(&DescriptionLogic, input),
        "csp_ac3" => Err("unsupported breed: csp_ac3".to_string()),
        "analogy_sme" => Err("unsupported breed: analogy_sme".to_string()),
        "ltl_monitor" => Err("unsupported breed: ltl_monitor".to_string()),
        "default_logic" => Err("unsupported breed: default_logic".to_string()),
        "htn_planning" => Err("unsupported breed: htn_planning".to_string()),
        "frames_inheritance" => Err("unsupported breed: frames_inheritance".to_string()),
        "ebl" => Err("unsupported breed: ebl".to_string()),
        "asp" => run_breed(&Asp, input),
        "abductive_ibe" => run_breed(&AbductiveIbe, input),
        "partial_order_plan" => run_breed(&PartialOrderPlan, input),
        "event_calculus" => run_breed(&EventCalculus, input),
        "mdp" => run_breed(&Mdp, input),
        "version_space" => run_breed(&VersionSpace, input),
        "belief_merging" => run_breed(&BeliefMerging, input),
        "qualitative_reason" => run_breed(&QualitativeReason, input),
        "script_sam" => run_breed(&ScriptSam, input),
        "clp" => run_breed(&Clp, input),
        "situation_calculus" => Err("unsupported breed: situation_calculus".to_string()),
        "circumscription" => Err("unsupported breed: circumscription".to_string()),
        "act_r" => Err("unsupported breed: act_r".to_string()),
        "problog" => Err("unsupported breed: problog".to_string()),
        "sat_cdcl" => Err("unsupported breed: sat_cdcl".to_string()),
        "episodic_memory" => Err("unsupported breed: episodic_memory".to_string()),
        "rl_symbolic" => Err("unsupported breed: rl_symbolic".to_string()),
        "ctl_check" => Err("unsupported breed: ctl_check".to_string()),
        "naive_physics" => Err("unsupported breed: naive_physics".to_string()),
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
        "bayesian_network" => Err("unsupported breed: bayesian_network".to_string()),
        "fuzzy_logic" => Err("unsupported breed: fuzzy_logic".to_string()),
        "dempster_shafer" => Err("unsupported breed: dempster_shafer".to_string()),
        "abductive_lp" => AbductiveLp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "ilp" => Err("unsupported breed: ilp".to_string()),
        "allen_temporal" => Err("unsupported breed: allen_temporal".to_string()),
        "description_logic" => DescriptionLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "csp_ac3" => Err("unsupported breed: csp_ac3".to_string()),
        "analogy_sme" => Err("unsupported breed: analogy_sme".to_string()),
        "ltl_monitor" => Err("unsupported breed: ltl_monitor".to_string()),
        "default_logic" => Err("unsupported breed: default_logic".to_string()),
        "htn_planning" => Err("unsupported breed: htn_planning".to_string()),
        "frames_inheritance" => Err("unsupported breed: frames_inheritance".to_string()),
        "ebl" => Err("unsupported breed: ebl".to_string()),
        "asp" => Asp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "abductive_ibe" => AbductiveIbe.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "partial_order_plan" => PartialOrderPlan.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "event_calculus" => EventCalculus.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "mdp" => Mdp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "version_space" => VersionSpace.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "belief_merging" => BeliefMerging.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "qualitative_reason" => QualitativeReason.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "script_sam" => ScriptSam.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "clp" => Clp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "situation_calculus" => Err("unsupported breed: situation_calculus".to_string()),
        "circumscription" => Err("unsupported breed: circumscription".to_string()),
        "act_r" => Err("unsupported breed: act_r".to_string()),
        "problog" => Err("unsupported breed: problog".to_string()),
        "sat_cdcl" => Err("unsupported breed: sat_cdcl".to_string()),
        "episodic_memory" => Err("unsupported breed: episodic_memory".to_string()),
        "rl_symbolic" => Err("unsupported breed: rl_symbolic".to_string()),
        "ctl_check" => Err("unsupported breed: ctl_check".to_string()),
        "naive_physics" => Err("unsupported breed: naive_physics".to_string()),
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
