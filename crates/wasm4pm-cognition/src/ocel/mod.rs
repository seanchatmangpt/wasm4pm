//! OCEL 2.0 provability layer for cognition breeds.
//!
//! Van der Aalst doctrine: every breed execution must produce an object-centric
//! event log checked against a declared lifecycle model. Non-conforming execution
//! is refused.
//!
//! Key constraint: NO wall-clock timestamps (determinism merge gate).
//! Uses constant epoch "1970-01-01T00:00:00Z" + `logical_step` attribute.

use serde::{Deserialize, Serialize};

use crate::breeds::TraceStep;

/// A single event in an OCEL 2.0 log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcelEvent {
    /// Unique event identifier
    pub event_id: String,
    /// Activity label (maps to breed trace step kind)
    pub activity: String,
    /// Always "1970-01-01T00:00:00Z" — no wall-clock
    pub timestamp: String,
    /// Event attributes (includes logical_step for ordering)
    pub attributes: std::collections::BTreeMap<String, serde_json::Value>,
    /// Object-to-object references: (object_type, object_id)
    pub o2o: Vec<(String, String)>,
}

/// A single object in an OCEL 2.0 log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcelObject {
    /// Unique object identifier
    pub object_id: String,
    /// Object type (e.g., "run", "breed", "fact")
    pub object_type: String,
    /// Object attributes
    pub attributes: std::collections::BTreeMap<String, serde_json::Value>,
}

/// An OCEL 2.0 event log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcelLog {
    /// Declared object types
    pub object_types: Vec<String>,
    /// Declared event types (distinct activities)
    pub event_types: Vec<String>,
    /// All objects referenced in events
    pub objects: Vec<OcelObject>,
    /// All events in logical order
    pub events: Vec<OcelEvent>,
}

/// Per-breed lifecycle model: ordered phases where each phase is a set of allowed event kinds.
pub struct BreedLifecycleModel {
    /// Breed identifier this model applies to
    pub breed_id: &'static str,
    /// Ordered phases (DFA states)
    pub phases: &'static [LifecyclePhase],
}

/// A single phase in a breed's lifecycle model.
pub struct LifecyclePhase {
    /// Phase name (for error messages)
    pub name: &'static str,
    /// Event kinds that belong to this phase
    pub kinds: &'static [&'static str],
    /// Minimum occurrences required (0 = optional)
    pub min_occurrences: usize,
    /// Maximum occurrences allowed (usize::MAX = unbounded)
    pub max_occurrences: usize,
}

/// Static per-breed lifecycle models (P0 tier: the 13 founding breeds).
pub mod models_p0;
/// Static per-breed lifecycle models (P1 tier).
pub mod models_p1;
/// Models P2
pub mod models_p2;
/// `include_str!` sources for hand-authored OCPN model JSON files.
pub mod model_sources;

/// Get the lifecycle model for a breed by id.
pub fn lifecycle_model_for(breed_id: &str) -> Option<&'static BreedLifecycleModel> {
    match breed_id {
        "mycin" => Some(&models_p0::MYCIN_MODEL),
        "hearsay" => Some(&models_p0::HEARSAY_MODEL),
        "cbr" => Some(&models_p0::CBR_MODEL),
        "gps" => Some(&models_p0::GPS_MODEL),
        "strips" => Some(&models_p0::STRIPS_MODEL),
        "prolog" => Some(&models_p0::PROLOG_MODEL),
        "soar" => Some(&models_p0::SOAR_MODEL),
        "eliza" => Some(&models_p0::ELIZA_MODEL),
        "dendral" => Some(&models_p0::DENDRAL_MODEL),
        "autoinstinct_neurosis" => Some(&models_p0::AUTOINSTINCT_NEUROSIS_MODEL),
        "autoinstinct_vision" => Some(&models_p0::AUTOINSTINCT_VISION_MODEL),
        "autoinstinct_semantics" => Some(&models_p0::AUTOINSTINCT_SEMANTICS_MODEL),
        "autoinstinct_learning" => Some(&models_p0::AUTOINSTINCT_LEARNING_MODEL),
        "ltl_monitor" => Some(&models_p1::LTL_MONITOR_MODEL),
        "allen_temporal" => Some(&models_p1::ALLEN_TEMPORAL_MODEL),
        "fuzzy_logic" => Some(&models_p1::FUZZY_LOGIC_MODEL),
        "bayesian_network" => Some(&models_p1::BAYESIAN_NETWORK_MODEL),
        "htn_planning" => Some(&models_p1::HTN_PLANNING_MODEL),
        "dempster_shafer" => Some(&models_p1::DEMPSTER_SHAFER_MODEL),
        "abductive_ibe" => Some(&models_p2::ABDUCTIVE_IBE_MODEL),
        "partial_order_plan" => Some(&models_p2::PARTIAL_ORDER_PLAN_MODEL),
        "event_calculus" => Some(&models_p2::EVENT_CALCULUS_MODEL),
        _ => None,
    }
}

/// Deprecated alias for [`lifecycle_model_for`].
#[deprecated(note="Use lifecycle_model_for")]
pub fn get_model(breed_id: &str) -> Option<&'static BreedLifecycleModel> {
    lifecycle_model_for(breed_id)
}

/// Result of replaying a trace against a breed lifecycle model.
#[derive(Debug, Clone)]
pub struct ConformanceResult {
    /// Fitness score 0.0..=1.0
    pub fitness: f32,
    /// Breed/model id
    pub model_id: String,
    /// Reasons for non-conformance
    pub refusals: Vec<String>,
    /// True iff fitness == 1.0 and refusals is empty
    pub is_conforming: bool,
}

/// Derive an OCEL 2.0 event log from a breed's inference trace.
/// Uses constant epoch timestamps (no wall-clock) + `logical_step` attribute.
pub fn derive_ocel(breed_id: &str, run_id: &str, steps: &[TraceStep]) -> OcelLog {
    let mut events: Vec<OcelEvent> = Vec::new();
    let mut object_ids: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

    let run_obj_id = format!("run:{}", &run_id[..8.min(run_id.len())]);
    let breed_obj_id = format!("breed:{}", breed_id);
    object_ids.insert(run_obj_id.clone());
    object_ids.insert(breed_obj_id.clone());

    // Synthetic run-start event at logical_step 0
    let mut start_attrs = std::collections::BTreeMap::new();
    start_attrs.insert(
        "logical_step".to_string(),
        serde_json::Value::Number(serde_json::Number::from(0u64)),
    );
    start_attrs.insert(
        "breed".to_string(),
        serde_json::Value::String(breed_id.to_string()),
    );
    events.push(OcelEvent {
        event_id: format!("{}-start", run_id),
        activity: "run-start".to_string(),
        timestamp: "1970-01-01T00:00:00Z".to_string(),
        attributes: start_attrs,
        o2o: vec![
            ("run".to_string(), run_obj_id.clone()),
            ("breed".to_string(), breed_obj_id.clone()),
        ],
    });

    // One OCEL event per trace step (logical_step = step + 1 to keep strictly after start)
    for step in steps {
        let logical = step.step as u64 + 1;
        let mut attrs = std::collections::BTreeMap::new();
        attrs.insert(
            "logical_step".to_string(),
            serde_json::Value::Number(serde_json::Number::from(logical)),
        );
        attrs.insert(
            "detail".to_string(),
            serde_json::Value::String(step.detail.clone()),
        );
        attrs.insert(
            "depth".to_string(),
            serde_json::Value::Number(serde_json::Number::from(step.depth as u64)),
        );

        let mut o2o = vec![
            ("run".to_string(), run_obj_id.clone()),
            ("breed".to_string(), breed_obj_id.clone()),
        ];
        for (obj_type, obj_id) in &step.objects {
            object_ids.insert(format!("{}:{}", obj_type, obj_id));
            o2o.push((obj_type.clone(), format!("{}:{}", obj_type, obj_id)));
        }

        events.push(OcelEvent {
            event_id: format!("{}-{}", run_id, step.step),
            activity: step.kind.clone(),
            timestamp: "1970-01-01T00:00:00Z".to_string(),
            attributes: attrs,
            o2o,
        });
    }

    // Synthetic run-end event
    let end_step = steps.len() as u64 + 1;
    let mut end_attrs = std::collections::BTreeMap::new();
    end_attrs.insert(
        "logical_step".to_string(),
        serde_json::Value::Number(serde_json::Number::from(end_step)),
    );
    events.push(OcelEvent {
        event_id: format!("{}-end", run_id),
        activity: "run-end".to_string(),
        timestamp: "1970-01-01T00:00:00Z".to_string(),
        attributes: end_attrs,
        o2o: vec![
            ("run".to_string(), run_obj_id.clone()),
            ("breed".to_string(), breed_obj_id.clone()),
        ],
    });

    let objects: Vec<OcelObject> = object_ids
        .into_iter()
        .map(|id| {
            let obj_type = id.split(':').next().unwrap_or("unknown").to_string();
            OcelObject {
                object_id: id.clone(),
                object_type: obj_type,
                attributes: std::collections::BTreeMap::new(),
            }
        })
        .collect();

    let event_types: Vec<String> = {
        let mut seen = std::collections::BTreeSet::new();
        for e in &events {
            seen.insert(e.activity.clone());
        }
        seen.into_iter().collect()
    };

    OcelLog {
        object_types: vec![
            "run".to_string(),
            "breed".to_string(),
            "candidate".to_string(),
            "fact".to_string(),
            "rule".to_string(),
            "hypothesis".to_string(),
            "plan_step".to_string(),
            "decision".to_string(),
        ],
        event_types,
        objects,
        events,
    }
}

/// Check temporal conformance: logical_step attributes must be strictly increasing.
pub fn check_temporal_conformance(log: &OcelLog) -> Result<(), String> {
    let mut last_step: Option<u64> = None;
    for event in &log.events {
        if let Some(val) = event.attributes.get("logical_step") {
            if let Some(step) = val.as_u64() {
                if let Some(prev) = last_step {
                    if step <= prev {
                        return Err(format!(
                            "non-monotonic logical_step: {} after {}",
                            step, prev
                        ));
                    }
                }
                last_step = Some(step);
            }
        }
    }
    Ok(())
}

/// Validate an OCEL log against a breed's declared lifecycle model.
/// Returns `ConformanceResult` with fitness score and refusal reasons.
pub fn validate_ocel_alignment(log: &OcelLog, model: &BreedLifecycleModel) -> ConformanceResult {
    let mut refusals: Vec<String> = Vec::new();

    // Filter out synthetic start/end events for phase checking
    let step_events: Vec<&OcelEvent> = log
        .events
        .iter()
        .filter(|e| e.activity != "run-start" && e.activity != "run-end")
        .collect();

    let mut phase_idx = 0usize;
    let mut phase_counts: Vec<usize> = vec![0; model.phases.len()];

    for event in &step_events {
        let kind = &event.activity;
        let mut matched = false;
        for pi in phase_idx..model.phases.len() {
            let phase = &model.phases[pi];
            if phase.kinds.contains(&kind.as_str()) {
                // Verify skipped phases had enough occurrences
                for skipped in phase_idx..pi {
                    if phase_counts[skipped] < model.phases[skipped].min_occurrences {
                        refusals.push(format!(
                            "phase '{}' skipped but required min={} occurrences (got {})",
                            model.phases[skipped].name,
                            model.phases[skipped].min_occurrences,
                            phase_counts[skipped]
                        ));
                    }
                }
                phase_idx = pi;
                phase_counts[pi] += 1;

                if phase_counts[pi] > model.phases[pi].max_occurrences {
                    refusals.push(format!(
                        "phase '{}' exceeded max={} occurrences",
                        model.phases[pi].name, model.phases[pi].max_occurrences
                    ));
                }
                matched = true;
                break;
            }
        }
        let _ = matched; // unknown event kinds are allowed (debug events)
    }

    // Check final phase min_occurrences
    for pi in 0..model.phases.len() {
        if phase_counts[pi] < model.phases[pi].min_occurrences {
            refusals.push(format!(
                "phase '{}' required min={} occurrences but got {}",
                model.phases[pi].name, model.phases[pi].min_occurrences, phase_counts[pi]
            ));
        }
    }

    // Temporal conformance
    if let Err(e) = check_temporal_conformance(log) {
        refusals.push(e);
    }

    let fitness = if refusals.is_empty() {
        1.0_f32
    } else {
        let required: usize = model
            .phases
            .iter()
            .filter(|p| p.min_occurrences > 0)
            .count();
        let satisfied: usize = model
            .phases
            .iter()
            .enumerate()
            .filter(|(i, p)| p.min_occurrences > 0 && phase_counts[*i] >= p.min_occurrences)
            .count();
        if required == 0 {
            1.0
        } else {
            satisfied as f32 / required as f32
        }
    };

    ConformanceResult {
        fitness,
        model_id: model.breed_id.to_string(),
        refusals: refusals.clone(),
        is_conforming: refusals.is_empty() && fitness >= 1.0,
    }
}
