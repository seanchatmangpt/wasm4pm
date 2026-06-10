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

// MYCIN lifecycle model: load-facts* → fire-rule+ → decision?
/// MYCIN lifecycle
pub static MYCIN_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "mycin",
    phases: &[
        LifecyclePhase {
            name: "load-facts",
            kinds: &["load-fact"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "fire-rules",
            kinds: &["fire-rule"],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// Hearsay lifecycle: seed + post-hypothesis+
pub static HEARSAY_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "hearsay",
    phases: &[LifecyclePhase {
        name: "hypothesize",
        kinds: &[
            "seed",
            "post-hypothesis",
            "enqueue-ksar",
            "stale-ksar",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// CBR lifecycle: build-index → retrieve-candidates → score-case+ → decision?
pub static CBR_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "cbr",
    phases: &[
        LifecyclePhase {
            name: "index",
            kinds: &["build-index"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "retrieve",
            kinds: &["retrieve-candidates"],
            min_occurrences: 1,
            max_occurrences: 1,
        },
        LifecyclePhase {
            name: "score",
            kinds: &[
                "score-case",
                "reuse-adapt",
                "revise-accept",
                "revise-reject",
                "retain-case",
            ],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// GPS lifecycle: reduce-gap / apply-operator
pub static GPS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "gps",
    phases: &[LifecyclePhase {
        name: "plan",
        kinds: &[
            "reduce-gap",
            "apply-operator",
            "check-presatisfied",
            "match-goal",
            "set-goal",
            "subgoal",
            "achieve-diff",
            "decision",
            "no-plan",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// STRIPS lifecycle: subgoal/try-action/execute/iterate-depth+
pub static STRIPS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "strips",
    phases: &[LifecyclePhase {
        name: "plan",
        kinds: &[
            "subgoal",
            "try-action",
            "execute",
            "iterate-depth",
            "check-presatisfied",
            "frame-axioms-loaded",
            "apply-action",
            "add-effect",
            "del-effect",
            "decision",
            "no-plan",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Prolog lifecycle: intern-fact/load-rule* → kernel-query+ → decision?
pub static PROLOG_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "prolog",
    phases: &[
        LifecyclePhase {
            name: "load",
            kinds: &["intern-fact", "load-fact", "load-rule"],
            min_occurrences: 0,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "query",
            kinds: &[
                "kernel-query",
                "unify",
                "sld-step",
                "match-rule",
                "bind-var",
            ],
            min_occurrences: 1,
            max_occurrences: usize::MAX,
        },
        LifecyclePhase {
            name: "decision",
            kinds: &["decision"],
            min_occurrences: 0,
            max_occurrences: 1,
        },
    ],
};

/// SOAR lifecycle: evaluate-single/prohibit/veto/dominate/impasse (preference evaluation)
pub static SOAR_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "soar",
    phases: &[LifecyclePhase {
        name: "evaluate",
        kinds: &[
            "evaluate-single",
            "prohibit",
            "veto-non-required",
            "dominate",
            "impasse",
            "propose-operator",
            "preference",
            "decide-operator",
            "impasse-unresolved-fallback",
            "subgoal",
            "apply-operator",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// ELIZA lifecycle: try-pattern* → match-pattern/bind-slot+
pub static ELIZA_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "eliza",
    phases: &[LifecyclePhase {
        name: "match",
        kinds: &[
            "try-pattern",
            "match-pattern",
            "bind-slot",
            "keyword-match",
            "transform",
            "reflect",
            "response",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// DENDRAL lifecycle: eliminate/survive+ (constraint-test then prune)
pub static DENDRAL_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "dendral",
    phases: &[LifecyclePhase {
        name: "test",
        kinds: &[
            "eliminate",
            "survive",
            "generate-hypothesis",
            "enumerate",
            "test-hypothesis",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Neurosis lifecycle: seed-beliefs + affect-snapshot
pub static AUTOINSTINCT_NEUROSIS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_neurosis",
    phases: &[LifecyclePhase {
        name: "analyze",
        kinds: &[
            "seed-beliefs",
            "affect-snapshot",
            "analyze",
            "detect-pattern",
            "belief-update",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Vision lifecycle: observe-object / find-clear-object
pub static AUTOINSTINCT_VISION_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_vision",
    phases: &[LifecyclePhase {
        name: "perceive",
        kinds: &[
            "observe-object",
            "find-clear-object",
            "perceive",
            "segment",
            "classify",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Semantics lifecycle: init-parser + extract-act/no-act-found
pub static AUTOINSTINCT_SEMANTICS_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_semantics",
    phases: &[LifecyclePhase {
        name: "parse",
        kinds: &[
            "init-parser",
            "no-act-found",
            "extract-act",
            "extract-recipient",
            "extract-source",
            "parse",
            "frame-bind",
            "atrans",
            "ptrans",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Autoinstinct Learning lifecycle: no-plan-found | plan-step+
pub static AUTOINSTINCT_LEARNING_MODEL: BreedLifecycleModel = BreedLifecycleModel {
    breed_id: "autoinstinct_learning",
    phases: &[LifecyclePhase {
        name: "plan",
        kinds: &[
            "plan-step",
            "no-plan-found",
            "update-distance",
            "expand-frontier",
            "goal-reached",
            "decision",
        ],
        min_occurrences: 1,
        max_occurrences: usize::MAX,
    }],
};

/// Get the lifecycle model for a breed by id.
pub fn get_model(breed_id: &str) -> Option<&'static BreedLifecycleModel> {
    match breed_id {
        "mycin" => Some(&MYCIN_MODEL),
        "hearsay" => Some(&HEARSAY_MODEL),
        "cbr" => Some(&CBR_MODEL),
        "gps" => Some(&GPS_MODEL),
        "strips" => Some(&STRIPS_MODEL),
        "prolog" => Some(&PROLOG_MODEL),
        "soar" => Some(&SOAR_MODEL),
        "eliza" => Some(&ELIZA_MODEL),
        "dendral" => Some(&DENDRAL_MODEL),
        "autoinstinct_neurosis" => Some(&AUTOINSTINCT_NEUROSIS_MODEL),
        "autoinstinct_vision" => Some(&AUTOINSTINCT_VISION_MODEL),
        "autoinstinct_semantics" => Some(&AUTOINSTINCT_SEMANTICS_MODEL),
        "autoinstinct_learning" => Some(&AUTOINSTINCT_LEARNING_MODEL),
        _ => None,
    }
}

/// Conformance check result from OCEL validation.
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
