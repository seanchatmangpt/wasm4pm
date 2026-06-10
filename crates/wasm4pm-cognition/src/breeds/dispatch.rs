#![allow(missing_docs)]
//! Breed dispatch: explicit, greppable string-match routing for every breed
//! id in the registry. Arms for breeds not implemented in this tree return
//! an "unsupported breed" error (the integrator unions arms across tiers).

use crate::breeds::{
    abductive_ibe::AbductiveIbe, abductive_lp::AbductiveLp, act_r::ActR,
    allen_temporal::AllenTemporal, analogy_sme::AnalogySme, asp::Asp,
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    bayesian_network::BayesianNetwork, belief_merging::BeliefMerging, cbr::Cbr,
    circumscription::Circumscription, clp::Clp, csp_ac3::CspAc3, ctl_check::CtlCheck,
    default_logic::DefaultLogic, dempster_shafer::DempsterShafer, dendral::Dendral,
    description_logic::DescriptionLogic, ebl::Ebl, episodic_memory::EpisodicMemory,
    event_calculus::EventCalculus, frame::Eliza, frames_inheritance::FramesInheritance,
    fuzzy_logic::FuzzyLogic, gps::Gps, hearsay::Hearsay, htn_planning::HtnPlanning, ilp::Ilp,
    ltl_monitor::LtlMonitor, mdp::Mdp, naive_physics::NaivePhysics,
    partial_order_plan::PartialOrderPlan, problog::Problog, production_rules::Mycin,
    prolog::Prolog, qualitative_reason::QualitativeReason, rl_symbolic::RlSymbolic,
    sat_cdcl::SatCdcl, script_sam::ScriptSam, situation_calculus::SituationCalculus, soar::Soar,
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
        "bayesian_network" => run_breed(&BayesianNetwork, input),
        "fuzzy_logic" => run_breed(&FuzzyLogic, input),
        "dempster_shafer" => run_breed(&DempsterShafer, input),
        "abductive_lp" => run_breed(&AbductiveLp, input),
        "ilp" => run_breed(&Ilp, input),
        "allen_temporal" => run_breed(&AllenTemporal, input),
        "description_logic" => run_breed(&DescriptionLogic, input),
        "csp_ac3" => run_breed(&CspAc3, input),
        "analogy_sme" => run_breed(&AnalogySme, input),
        "ltl_monitor" => run_breed(&LtlMonitor, input),
        "default_logic" => run_breed(&DefaultLogic, input),
        "htn_planning" => run_breed(&HtnPlanning, input),
        "frames_inheritance" => run_breed(&FramesInheritance, input),
        "ebl" => run_breed(&Ebl, input),
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
        "situation_calculus" => run_breed(&SituationCalculus, input),
        "circumscription" => run_breed(&Circumscription, input),
        "act_r" => run_breed(&ActR, input),
        "problog" => run_breed(&Problog, input),
        "sat_cdcl" => run_breed(&SatCdcl, input),
        "episodic_memory" => run_breed(&EpisodicMemory, input),
        "rl_symbolic" => run_breed(&RlSymbolic, input),
        "ctl_check" => run_breed(&CtlCheck, input),
        "naive_physics" => run_breed(&NaivePhysics, input),
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
        "bayesian_network" => BayesianNetwork.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "fuzzy_logic" => FuzzyLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "dempster_shafer" => DempsterShafer.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "abductive_lp" => AbductiveLp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "ilp" => Ilp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "allen_temporal" => AllenTemporal.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "description_logic" => DescriptionLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "csp_ac3" => CspAc3.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "analogy_sme" => AnalogySme.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "ltl_monitor" => LtlMonitor.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "default_logic" => DefaultLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "htn_planning" => HtnPlanning.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "frames_inheritance" => FramesInheritance.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "ebl" => Ebl.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
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
        "situation_calculus" => SituationCalculus.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "circumscription" => Circumscription.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "act_r" => ActR.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "problog" => Problog.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "sat_cdcl" => SatCdcl.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "episodic_memory" => EpisodicMemory.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "rl_symbolic" => RlSymbolic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "ctl_check" => CtlCheck.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        "naive_physics" => NaivePhysics.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
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
