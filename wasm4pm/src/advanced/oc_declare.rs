use crate::models::OCEL;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// OC-DECLARE Templates
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OCDeclareTemplate {
    Precedence,
    Response,
    Succession,
    Existence,
    Absence,
    Init,
}

/// OC-DECLARE Discovery Options
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct OCDeclareOptions {
    pub noise_threshold: f64,
}

/// OC-DECLARE Rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCDeclareRule {
    pub template: OCDeclareTemplate,
    pub activity_a: String,
    pub activity_b: Option<String>,
    pub object_type: String,
    pub confidence: f64,
    pub support: f64,
}

/// Discover OC-DECLARE rules from an OCEL log.
pub fn discover_oc_declare(ocel: &OCEL, options: OCDeclareOptions) -> Vec<OCDeclareRule> {
    let mut rules = Vec::new();

    // 1. Pre-map Object ID to Object Type
    let obj_to_type: HashMap<String, String> = ocel
        .objects
        .iter()
        .map(|o| (o.id.clone(), o.object_type.clone()))
        .collect();

    // 2. Group event types per object instance
    let mut object_traces: HashMap<String, Vec<String>> = HashMap::new();
    let mut event_idx_by_obj: HashMap<String, Vec<usize>> = HashMap::new();

    for (idx, event) in ocel.events.iter().enumerate() {
        for obj_id in event.all_object_ids() {
            event_idx_by_obj
                .entry(obj_id.to_string())
                .or_default()
                .push(idx);
        }
    }

    for (obj_id, mut indices) in event_idx_by_obj {
        indices.sort_by_key(|&idx| &ocel.events[idx].timestamp);
        let activities: Vec<String> = indices
            .iter()
            .map(|&idx| ocel.events[idx].event_type.clone())
            .collect();
        object_traces.insert(obj_id, activities);
    }

    // 3. Extract unique activities and object types
    let activity_types: HashSet<String> =
        ocel.events.iter().map(|e| e.event_type.clone()).collect();
    let object_types: Vec<String> = ocel.object_types.clone();

    // 4. Discovery Loop (Simplified for reference quality)
    for ot in &object_types {
        // Filter traces of this object type
        let traces_of_type: Vec<&Vec<String>> = object_traces
            .iter()
            .filter(|(id, _)| obj_to_type.get(*id) == Some(ot))
            .map(|(_, trace)| trace)
            .collect();

        let total_instances = traces_of_type.len();
        if total_instances == 0 {
            continue;
        }

        for act_a in &activity_types {
            // Existence / Absence / Init
            let mut init_count = 0;
            let mut existence_count = 0;
            for trace in &traces_of_type {
                if trace.first() == Some(act_a) {
                    init_count += 1;
                }
                if trace.contains(act_a) {
                    existence_count += 1;
                }
            }

            let init_conf = init_count as f64 / total_instances as f64;
            if init_conf >= 1.0 - options.noise_threshold {
                rules.push(OCDeclareRule {
                    template: OCDeclareTemplate::Init,
                    activity_a: act_a.clone(),
                    activity_b: None,
                    object_type: ot.clone(),
                    confidence: init_conf,
                    support: init_conf,
                });
            }

            let exist_conf = existence_count as f64 / total_instances as f64;
            if exist_conf >= 1.0 - options.noise_threshold {
                rules.push(OCDeclareRule {
                    template: OCDeclareTemplate::Existence,
                    activity_a: act_a.clone(),
                    activity_b: None,
                    object_type: ot.clone(),
                    confidence: exist_conf,
                    support: exist_conf,
                });
            }

            // Binary templates (Precedence, Response)
            for act_b in &activity_types {
                if act_a == act_b {
                    continue;
                }

                let mut precedence_satisfied = 0;
                let mut response_satisfied = 0;
                let mut a_count = 0;
                let mut b_count = 0;

                for trace in &traces_of_type {
                    let has_a = trace.contains(act_a);
                    let has_b = trace.contains(act_b);

                    if has_a {
                        a_count += 1;
                    }
                    if has_b {
                        b_count += 1;
                    }

                    if has_b {
                        // Precedence: if b occurs, a must have occurred before
                        let first_b = trace.iter().position(|r| r == act_b).unwrap();
                        if trace[..first_b].contains(act_a) {
                            precedence_satisfied += 1;
                        }
                    }

                    if has_a {
                        // Response: if a occurs, b must occur eventually after
                        let last_a = trace.iter().rposition(|r| r == act_a).unwrap();
                        if trace[last_a..].contains(act_b) {
                            response_satisfied += 1;
                        }
                    }
                }

                let prec_conf = if b_count > 0 {
                    precedence_satisfied as f64 / b_count as f64
                } else {
                    1.0
                };
                if prec_conf >= 1.0 - options.noise_threshold && b_count > 0 {
                    rules.push(OCDeclareRule {
                        template: OCDeclareTemplate::Precedence,
                        activity_a: act_a.clone(),
                        activity_b: Some(act_b.clone()),
                        object_type: ot.clone(),
                        confidence: prec_conf,
                        support: b_count as f64 / total_instances as f64,
                    });
                }

                let resp_conf = if a_count > 0 {
                    response_satisfied as f64 / a_count as f64
                } else {
                    1.0
                };
                if resp_conf >= 1.0 - options.noise_threshold && a_count > 0 {
                    rules.push(OCDeclareRule {
                        template: OCDeclareTemplate::Response,
                        activity_a: act_a.clone(),
                        activity_b: Some(act_b.clone()),
                        object_type: ot.clone(),
                        confidence: resp_conf,
                        support: a_count as f64 / total_instances as f64,
                    });
                }
            }
        }
    }

    rules
}
