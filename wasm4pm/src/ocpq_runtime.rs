use crate::models::{OCEL, OCELEvent};
use crate::ocpq_parser::{OcpqQuery, OcpqClause, OcpqRelation, OcpqScope};
use std::collections::HashMap;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OcpqVerdict {
    pub status: String, // "Allow" or "Deny"
    pub violations: Vec<String>,
}

pub fn check_relation(
    events: &[(usize, &OCELEvent)],
    left: &str,
    relation: OcpqRelation,
    right: &str,
) -> Vec<String> {
    let mut violations = Vec::new();
    match relation {
        OcpqRelation::Before => {
            // For every right, there must exist a preceding left
            for (i, (_, ev)) in events.iter().enumerate() {
                if ev.event_type == right {
                    let mut found = false;
                    for j in 0..i {
                        if events[j].1.event_type == left {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        violations.push(format!(
                            "Precedence violation: Event '{}' (id: {}) occurred without preceding '{}'",
                            right, ev.id, left
                        ));
                    }
                }
            }
        }
        OcpqRelation::After => {
            // For every right, there must exist a subsequent left (preceding in reverse)
            for (i, (_, ev)) in events.iter().enumerate() {
                if ev.event_type == right {
                    let mut found = false;
                    for j in (i + 1)..events.len() {
                        if events[j].1.event_type == left {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        violations.push(format!(
                            "Response violation: Event '{}' (id: {}) occurred without subsequent '{}'",
                            right, ev.id, left
                        ));
                    }
                }
            }
        }
        OcpqRelation::ImmediatelyBefore => {
            // For every right, its predecessor must be left
            for (i, (_, ev)) in events.iter().enumerate() {
                if ev.event_type == right {
                    if i == 0 || events[i - 1].1.event_type != left {
                        violations.push(format!(
                            "Immediate precedence violation: Event '{}' (id: {}) occurred without immediate preceding '{}'",
                            right, ev.id, left
                        ));
                    }
                }
            }
        }
        OcpqRelation::ImmediatelyAfter => {
            // For every left, its predecessor must be right (predecessor is right)
            for (i, (_, ev)) in events.iter().enumerate() {
                if ev.event_type == left {
                    if i == 0 || events[i - 1].1.event_type != right {
                        violations.push(format!(
                            "Immediate response violation: Event '{}' (id: {}) occurred without immediate preceding '{}'",
                            left, ev.id, right
                        ));
                    }
                }
            }
        }
    }
    violations
}

pub fn evaluate(ocel: &OCEL, query: &OcpqQuery) -> OcpqVerdict {
    let mut violations = Vec::new();

    let object_to_type: HashMap<String, String> = ocel.objects
        .iter()
        .map(|o| (o.id.clone(), o.object_type.clone()))
        .collect();

    for clause in &query.clauses {
        match clause {
            OcpqClause::Forbid { activity } => {
                for ev in &ocel.events {
                    if ev.event_type == *activity {
                        violations.push(format!(
                            "Forbid violation: Forbidden event '{}' (id: {}) occurred",
                            activity, ev.id
                        ));
                    }
                }
            }
            OcpqClause::Require { left, relation, right, scope } => {
                match scope {
                    OcpqScope::Global => {
                        let mut sorted_events: Vec<(usize, &OCELEvent)> = ocel.events.iter().enumerate().collect();
                        sorted_events.sort_by(|(idx_a, a), (idx_b, b)| {
                            match a.timestamp.cmp(&b.timestamp) {
                                std::cmp::Ordering::Equal => idx_a.cmp(idx_b),
                                other => other,
                            }
                        });
                        let mut cl_violations = check_relation(&sorted_events, left, *relation, right);
                        violations.append(&mut cl_violations);
                    }
                    OcpqScope::SameObject { object_type } => {
                        let mut events_by_object: HashMap<String, Vec<(usize, &OCELEvent)>> = HashMap::new();
                        for (idx, event) in ocel.events.iter().enumerate() {
                            for obj_id in event.all_object_ids() {
                                if let Some(ref ot) = object_type {
                                    if let Some(obj_type) = object_to_type.get(obj_id) {
                                        if obj_type == ot {
                                            events_by_object
                                                .entry(obj_id.to_string())
                                                .or_default()
                                                .push((idx, event));
                                        }
                                    }
                                } else {
                                    events_by_object
                                        .entry(obj_id.to_string())
                                        .or_default()
                                        .push((idx, event));
                                }
                            }
                        }

                        for (obj_id, mut ev_list) in events_by_object {
                            ev_list.sort_by(|(idx_a, a), (idx_b, b)| {
                                match a.timestamp.cmp(&b.timestamp) {
                                    std::cmp::Ordering::Equal => idx_a.cmp(idx_b),
                                    other => other,
                                }
                            });
                            let mut obj_violations = check_relation(&ev_list, left, *relation, right);
                            for v in &mut obj_violations {
                                *v = format!("Object {} - {}", obj_id, v);
                            }
                            violations.append(&mut obj_violations);
                        }
                    }
                }
            }
        }
    }

    let status = if violations.is_empty() {
        "Allow".to_string()
    } else {
        "Deny".to_string()
    };

    OcpqVerdict { status, violations }
}
