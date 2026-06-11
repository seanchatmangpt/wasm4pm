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
    circumscription::Circumscription, clp::Clp, construction_grammar::ConstructionGrammar,
    contingent_plan::ContingentPlan, csp_ac3::CspAc3, ctl_check::CtlCheck,
    default_logic::DefaultLogic, dempster_shafer::DempsterShafer, dendral::Dendral,
    description_logic::DescriptionLogic, ebl::Ebl, episodic_memory::EpisodicMemory,
    event_calculus::EventCalculus, frame::Eliza, frames_inheritance::FramesInheritance,
    fuzzy_logic::FuzzyLogic, gps::Gps, hearsay::Hearsay, htn_planning::HtnPlanning, ilp::Ilp,
    ltl_monitor::LtlMonitor, markov_logic::MarkovLogic, mdp::Mdp, meta_reasoning::MetaReasoning,
    morphological::Morphological, naive_physics::NaivePhysics, pomdp::Pomdp,
    partial_order_plan::PartialOrderPlan, problog::Problog, production_rules::Mycin,
    prolog::Prolog, qualitative_reason::QualitativeReason, rl_symbolic::RlSymbolic,
    sat_cdcl::SatCdcl, script_sam::ScriptSam, situation_calculus::SituationCalculus, soar::Soar,
    strips::Strips, tableaux::Tableaux, triz::Triz, ocpm_route_discoverer::OcpmRouteDiscoverer,
    version_space::VersionSpace, BreedId, BreedInput, BreedOutput, CognitionBreed,
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
    // Framework-level FM-5 gate: a breed cannot claim success without an
    // inference trace, independent of its own postconditions.
    if output.inference_trace.is_empty() {
        return Err(format!(
            "{}: empty inference trace (FM-5 fraud signal, framework gate)",
            b.id()
        ));
    }
    b.postconditions(input, &output)
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
/// Parses the breed string via `BreedId::from_str_id` then matches exhaustively
/// on the enum — the compiler enforces that every BreedId variant has a dispatch arm.
/// Unknown or unsupported breed strings are caught before the enum match.
pub fn dispatch_breed(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    let id = BreedId::from_str_id(breed).ok_or_else(|| {
        format!("unknown breed: {}", breed)
    })?;
    dispatch_breed_id(id, input)
}

/// Enum-match dispatch — exhaustiveness is compiler-enforced.
/// Adding a new `BreedId` variant without adding an arm here is a compile error.
pub fn dispatch_breed_id(id: BreedId, input: &BreedInput) -> Result<BreedOutput, String> {
    match id {
        BreedId::Eliza => run_breed(&Eliza, input),
        BreedId::Cbr => run_breed(&Cbr, input),
        BreedId::Dendral => run_breed(&Dendral, input),
        BreedId::Strips => run_breed(&Strips, input),
        BreedId::Prolog => run_breed(&Prolog, input),
        BreedId::Mycin => run_breed(&Mycin, input),
        BreedId::Gps => run_breed(&Gps, input),
        BreedId::Soar => run_breed(&Soar, input),
        BreedId::Hearsay => run_breed(&Hearsay, input),
        BreedId::AutoinstinctNeurosis => run_breed(&AutoinstinctNeurosis, input),
        BreedId::AutoinstinctSemantics => run_breed(&AutoinstinctSemantics, input),
        BreedId::AutoinstinctVision => run_breed(&AutoinstinctVision, input),
        BreedId::AutoinstinctLearning => run_breed(&AutoinstinctLearning, input),
        BreedId::BayesianNetwork => run_breed(&BayesianNetwork, input),
        BreedId::FuzzyLogic => run_breed(&FuzzyLogic, input),
        BreedId::DempsterShafer => run_breed(&DempsterShafer, input),
        BreedId::AbductiveLp => run_breed(&AbductiveLp, input),
        BreedId::Ilp => run_breed(&Ilp, input),
        BreedId::AllenTemporal => run_breed(&AllenTemporal, input),
        BreedId::DescriptionLogic => run_breed(&DescriptionLogic, input),
        BreedId::CspAc3 => run_breed(&CspAc3, input),
        BreedId::AnalogySme => run_breed(&AnalogySme, input),
        BreedId::LtlMonitor => run_breed(&LtlMonitor, input),
        BreedId::DefaultLogic => run_breed(&DefaultLogic, input),
        BreedId::HtnPlanning => run_breed(&HtnPlanning, input),
        BreedId::FramesInheritance => run_breed(&FramesInheritance, input),
        BreedId::Ebl => run_breed(&Ebl, input),
        BreedId::Asp => run_breed(&Asp, input),
        BreedId::AbductiveIbe => run_breed(&AbductiveIbe, input),
        BreedId::PartialOrderPlan => run_breed(&PartialOrderPlan, input),
        BreedId::EventCalculus => run_breed(&EventCalculus, input),
        BreedId::Mdp => run_breed(&Mdp, input),
        BreedId::VersionSpace => run_breed(&VersionSpace, input),
        BreedId::BeliefMerging => run_breed(&BeliefMerging, input),
        BreedId::QualitativeReason => run_breed(&QualitativeReason, input),
        BreedId::ScriptSam => run_breed(&ScriptSam, input),
        BreedId::Clp => run_breed(&Clp, input),
        BreedId::SituationCalculus => run_breed(&SituationCalculus, input),
        BreedId::Circumscription => run_breed(&Circumscription, input),
        BreedId::ActR => run_breed(&ActR, input),
        BreedId::Problog => run_breed(&Problog, input),
        BreedId::SatCdcl => run_breed(&SatCdcl, input),
        BreedId::EpisodicMemory => run_breed(&EpisodicMemory, input),
        BreedId::RlSymbolic => run_breed(&RlSymbolic, input),
        BreedId::CtlCheck => run_breed(&CtlCheck, input),
        BreedId::NaivePhysics => run_breed(&NaivePhysics, input),
        BreedId::Pomdp => run_breed(&Pomdp, input),
        BreedId::MarkovLogic => run_breed(&MarkovLogic, input),
        BreedId::MetaReasoning => run_breed(&MetaReasoning, input),
        BreedId::Morphological => run_breed(&Morphological, input),
        BreedId::ConstructionGrammar => run_breed(&ConstructionGrammar, input),
        BreedId::ContingentPlan => run_breed(&ContingentPlan, input),
        BreedId::Tableaux => run_breed(&Tableaux, input),
        BreedId::Triz => run_breed(&Triz, input),
        BreedId::OcpmRouteDiscoverer => run_breed(&OcpmRouteDiscoverer, input),
    }
}

/// Test harness: dispatch without OCEL or pre/post checks. Used for raw breed unit tests.
pub fn dispatch_breed_test(breed: &str, input: &BreedInput) -> Result<BreedOutput, String> {
    let id = BreedId::from_str_id(breed).ok_or_else(|| {
        format!("unknown breed: {}", breed)
    })?;
    dispatch_breed_test_id(id, input)
}

/// Enum-match test dispatch — same exhaustiveness guarantee as `dispatch_breed_id`.
pub fn dispatch_breed_test_id(id: BreedId, input: &BreedInput) -> Result<BreedOutput, String> {
    match id {
        BreedId::Eliza => Eliza.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Cbr => Cbr.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Dendral => Dendral.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Strips => Strips.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Prolog => Prolog.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Mycin => Mycin.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Gps => Gps.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Soar => Soar.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Hearsay => Hearsay.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AutoinstinctNeurosis => AutoinstinctNeurosis.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AutoinstinctSemantics => AutoinstinctSemantics.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AutoinstinctVision => AutoinstinctVision.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AutoinstinctLearning => AutoinstinctLearning.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::BayesianNetwork => BayesianNetwork.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::FuzzyLogic => FuzzyLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::DempsterShafer => DempsterShafer.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AbductiveLp => AbductiveLp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Ilp => Ilp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AllenTemporal => AllenTemporal.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::DescriptionLogic => DescriptionLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::CspAc3 => CspAc3.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AnalogySme => AnalogySme.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::LtlMonitor => LtlMonitor.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::DefaultLogic => DefaultLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::HtnPlanning => HtnPlanning.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::FramesInheritance => FramesInheritance.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Ebl => Ebl.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Asp => Asp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::AbductiveIbe => AbductiveIbe.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::PartialOrderPlan => PartialOrderPlan.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::EventCalculus => EventCalculus.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Mdp => Mdp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::VersionSpace => VersionSpace.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::BeliefMerging => BeliefMerging.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::QualitativeReason => QualitativeReason.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::ScriptSam => ScriptSam.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Clp => Clp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::SituationCalculus => SituationCalculus.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Circumscription => Circumscription.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::ActR => ActR.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Problog => Problog.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::SatCdcl => SatCdcl.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::EpisodicMemory => EpisodicMemory.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::RlSymbolic => RlSymbolic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::CtlCheck => CtlCheck.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::NaivePhysics => NaivePhysics.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Pomdp => Pomdp.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::MarkovLogic => MarkovLogic.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::MetaReasoning => MetaReasoning.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Morphological => Morphological.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::ConstructionGrammar => ConstructionGrammar.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::ContingentPlan => ContingentPlan.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Tableaux => Tableaux.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::Triz => Triz.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
        BreedId::OcpmRouteDiscoverer => OcpmRouteDiscoverer.run(input).map_err(|e| format!("{}: {}", e.breed, e.message)),
    }
}
