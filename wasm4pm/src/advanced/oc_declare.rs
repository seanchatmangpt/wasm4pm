use crate::models::OCEL;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

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
        indices.sort_unstable_by_key(|&idx| &ocel.events[idx].timestamp);
        let activities: Vec<String> = indices
            .iter()
            .map(|&idx| ocel.events[idx].event_type.clone())
            .collect();
        object_traces.insert(obj_id, activities);
    }

    // 3. Extract unique activities and object types
    let activity_types: BTreeSet<String> =
        ocel.events.iter().map(|e| e.event_type.clone()).collect();
    let object_types: &[String] = &ocel.object_types;

    // 4. Discovery Loop (Simplified for reference quality)
    for ot in object_types {
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

            // Absence: activity from the global event-type set that never
            // occurs for any object of this type.
            if existence_count == 0 {
                rules.push(OCDeclareRule {
                    template: OCDeclareTemplate::Absence,
                    activity_a: act_a.clone(),
                    activity_b: None,
                    object_type: ot.clone(),
                    confidence: 1.0,
                    support: 1.0,
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
                let prec_holds = prec_conf >= 1.0 - options.noise_threshold && b_count > 0;
                let prec_support = b_count as f64 / total_instances as f64;
                if prec_holds {
                    rules.push(OCDeclareRule {
                        template: OCDeclareTemplate::Precedence,
                        activity_a: act_a.clone(),
                        activity_b: Some(act_b.clone()),
                        object_type: ot.clone(),
                        confidence: prec_conf,
                        support: prec_support,
                    });
                }

                let resp_conf = if a_count > 0 {
                    response_satisfied as f64 / a_count as f64
                } else {
                    1.0
                };
                let resp_holds = resp_conf >= 1.0 - options.noise_threshold && a_count > 0;
                let resp_support = a_count as f64 / total_instances as f64;
                if resp_holds {
                    rules.push(OCDeclareRule {
                        template: OCDeclareTemplate::Response,
                        activity_a: act_a.clone(),
                        activity_b: Some(act_b.clone()),
                        object_type: ot.clone(),
                        confidence: resp_conf,
                        support: resp_support,
                    });
                }

                // Succession(a,b) = Response(a,b) ∧ Precedence(a,b); emitted
                // only when both hold, with the weaker (min) values.
                if prec_holds && resp_holds {
                    rules.push(OCDeclareRule {
                        template: OCDeclareTemplate::Succession,
                        activity_a: act_a.clone(),
                        activity_b: Some(act_b.clone()),
                        object_type: ot.clone(),
                        confidence: prec_conf.min(resp_conf),
                        support: prec_support.min(resp_support),
                    });
                }
            }
        }
    }

    rules
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OCELEvent, OCELObject};

    fn ev(id: &str, event_type: &str, ts: &str, obj_ids: &[&str]) -> OCELEvent {
        OCELEvent {
            id: id.to_string(),
            event_type: event_type.to_string(),
            timestamp: ts.to_string(),
            attributes: std::collections::BTreeMap::new(),
            object_ids: obj_ids.iter().map(|s| s.to_string()).collect(),
            object_refs: vec![],
        }
    }

    fn obj(id: &str, object_type: &str) -> OCELObject {
        OCELObject {
            id: id.to_string(),
            object_type: object_type.to_string(),
            attributes: std::collections::BTreeMap::new(),
            changes: vec![],
            embedded_relations: vec![],
        }
    }

    /// Hand-built OCEL: object type "T" (object t1, trace ⟨a,b⟩) and object
    /// type "U" (object u1, single event of type "x").
    fn two_type_ocel() -> OCEL {
        OCEL {
            event_types: vec!["a".into(), "b".into(), "x".into()],
            object_types: vec!["T".into(), "U".into()],
            events: vec![
                ev("e1", "a", "2024-01-01T10:00:00Z", &["t1"]),
                ev("e2", "b", "2024-01-01T11:00:00Z", &["t1"]),
                ev("e3", "x", "2024-01-01T12:00:00Z", &["u1"]),
            ],
            objects: vec![obj("t1", "T"), obj("u1", "U")],
            object_relations: vec![],
        }
    }

    #[test]
    fn succession_emitted_when_response_and_precedence_both_hold() {
        let ocel = two_type_ocel();
        let rules = discover_oc_declare(
            &ocel,
            OCDeclareOptions {
                noise_threshold: 0.0,
            },
        );

        let find = |t: OCDeclareTemplate| {
            rules.iter().find(|r| {
                r.template == t
                    && r.object_type == "T"
                    && r.activity_a == "a"
                    && r.activity_b.as_deref() == Some("b")
            })
        };
        let resp = find(OCDeclareTemplate::Response).expect("response(a,b) must hold for T");
        let prec = find(OCDeclareTemplate::Precedence).expect("precedence(a,b) must hold for T");
        let succ = find(OCDeclareTemplate::Succession).expect("succession(a,b) must be emitted");
        assert_eq!(succ.confidence, resp.confidence.min(prec.confidence));
        assert_eq!(succ.support, resp.support.min(prec.support));
        assert_eq!(succ.confidence, 1.0);
    }

    #[test]
    fn succession_not_emitted_without_both_directions() {
        // Trace ⟨b,a⟩: response(a,b) fails (no b after last a) and
        // precedence(a,b) fails (no a before first b) → no succession(a,b).
        let ocel = OCEL {
            event_types: vec!["a".into(), "b".into()],
            object_types: vec!["T".into()],
            events: vec![
                ev("e1", "b", "2024-01-01T10:00:00Z", &["t1"]),
                ev("e2", "a", "2024-01-01T11:00:00Z", &["t1"]),
            ],
            objects: vec![obj("t1", "T")],
            object_relations: vec![],
        };
        let rules = discover_oc_declare(
            &ocel,
            OCDeclareOptions {
                noise_threshold: 0.0,
            },
        );
        assert!(
            !rules
                .iter()
                .any(|r| r.template == OCDeclareTemplate::Succession
                    && r.activity_a == "a"
                    && r.activity_b.as_deref() == Some("b")),
            "succession(a,b) must not be emitted when neither direction holds"
        );
    }

    #[test]
    fn absence_emitted_for_activity_never_seen_by_object_type() {
        let ocel = two_type_ocel();
        let rules = discover_oc_declare(
            &ocel,
            OCDeclareOptions {
                noise_threshold: 0.0,
            },
        );
        // "x" occurs only for type U → Absence(x) must be declared for T.
        let absence_x_for_t = rules
            .iter()
            .find(|r| {
                r.template == OCDeclareTemplate::Absence
                    && r.object_type == "T"
                    && r.activity_a == "x"
            })
            .expect("Absence(x) must be emitted for type T");
        assert_eq!(absence_x_for_t.confidence, 1.0);
        // And no Absence(a) for T — "a" occurs for T.
        assert!(!rules
            .iter()
            .any(|r| r.template == OCDeclareTemplate::Absence
                && r.object_type == "T"
                && r.activity_a == "a"));
    }
}
