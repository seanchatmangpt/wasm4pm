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

pub struct OcpqEvaluator;

impl OcpqEvaluator {
    pub fn evaluate_compat(ocel: &OCEL, query: &wasm4pm_compat::ocpq::OcpqQuery) -> OcpqVerdict {
        let mut violations = Vec::new();

        let object_to_type: HashMap<String, String> = ocel.objects
            .iter()
            .map(|o| (o.id.clone(), o.object_type.clone()))
            .collect();

        // Build a map of object ID to related events
        let mut events_by_object: HashMap<String, Vec<(usize, &OCELEvent)>> = HashMap::new();
        for (idx, event) in ocel.events.iter().enumerate() {
            for obj_id in event.all_object_ids() {
                events_by_object
                    .entry(obj_id.to_string())
                    .or_default()
                    .push((idx, event));
            }
        }

        // Sort events for each object by timestamp
        for ev_list in events_by_object.values_mut() {
            ev_list.sort_by(|(idx_a, a), (idx_b, b)| {
                let ta = crate::models::parse_timestamp_ms(&a.timestamp).unwrap_or(0);
                let tb = crate::models::parse_timestamp_ms(&b.timestamp).unwrap_or(0);
                match ta.cmp(&tb) {
                    std::cmp::Ordering::Equal => idx_a.cmp(idx_b),
                    other => other,
                }
            });
        }

        for predicate in &query.predicates {
            match &predicate.kind {
                wasm4pm_compat::ocpq::PredicateKind::Event(expr) => {
                    // Check if it's a forbid instruction:
                    if expr.to_uppercase().contains("FORBID") {
                        let activity = expr.split_whitespace().last().unwrap_or("").to_string();
                        for ev in &ocel.events {
                            if ev.event_type == activity {
                                violations.push(format!(
                                    "Forbid violation: Forbidden event '{}' (id: {}) occurred",
                                    activity, ev.id
                                ));
                            }
                        }
                    } else if expr.to_uppercase().contains("REQUIRE") {
                        // REQUIRE left BEFORE/AFTER right
                        // We can parse simple REQUIRE left BEFORE right, etc.
                        let parts: Vec<&str> = expr.split_whitespace().collect();
                        if parts.len() >= 4 {
                            let left = parts[1].to_string();
                            let rel_str = parts[2].to_uppercase();
                            let right = parts[3].to_string();
                            let relation = match rel_str.as_str() {
                                "BEFORE" => OcpqRelation::Before,
                                "AFTER" => OcpqRelation::After,
                                "IMMEDIATELY_BEFORE" | "IMMEDIATELY BEFORE" => OcpqRelation::ImmediatelyBefore,
                                "IMMEDIATELY_AFTER" | "IMMEDIATELY AFTER" => OcpqRelation::ImmediatelyAfter,
                                _ => OcpqRelation::Before,
                            };
                            let mut sorted_events: Vec<(usize, &OCELEvent)> = ocel.events.iter().enumerate().collect();
                            sorted_events.sort_by(|(idx_a, a), (idx_b, b)| {
                                let ta = crate::models::parse_timestamp_ms(&a.timestamp).unwrap_or(0);
                                let tb = crate::models::parse_timestamp_ms(&b.timestamp).unwrap_or(0);
                                match ta.cmp(&tb) {
                                    std::cmp::Ordering::Equal => idx_a.cmp(idx_b),
                                    other => other,
                                }
                            });
                            let mut cl_violations = check_relation(&sorted_events, &left, relation, &right);
                            violations.append(&mut cl_violations);
                        }
                    }
                }
                wasm4pm_compat::ocpq::PredicateKind::E2ORelation { event_var, object_var, qualifier } => {
                    for ev in &ocel.events {
                        if ev.event_type == *event_var {
                            let mut found = false;
                            for ref_obj in &ev.object_refs {
                                if let Some(ot) = object_to_type.get(&ref_obj.object_id) {
                                    if ot == object_var {
                                        if let Some(q) = qualifier {
                                            if ref_obj.qualifier == *q {
                                                found = true;
                                                break;
                                            }
                                        } else {
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            // Also check simple object_ids:
                            if !found {
                                for obj_id in &ev.object_ids {
                                    if let Some(ot) = object_to_type.get(obj_id) {
                                        if ot == object_var {
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if !found {
                                violations.push(format!(
                                    "E2O relation violation: Event '{}' (id: {}) does not have a relationship to object type '{}' with qualifier '{:?}'",
                                    event_var, ev.id, object_var, qualifier
                                ));
                            }
                        }
                    }
                }
                wasm4pm_compat::ocpq::PredicateKind::O2ORelation { object_var1, object_var2, qualifier } => {
                    for obj in &ocel.objects {
                        if obj.object_type == *object_var1 {
                            let mut found = false;
                            // Check embedded relations:
                            for rel in &obj.embedded_relations {
                                if let Some(ot) = object_to_type.get(&rel.object_id) {
                                    if ot == object_var2 {
                                        if let Some(q) = qualifier {
                                            if rel.qualifier == *q {
                                                found = true;
                                                break;
                                            }
                                        } else {
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            // Also check global object_relations:
                            if !found {
                                for rel in &ocel.object_relations {
                                    if rel.source_id == obj.id {
                                        if let Some(ot) = object_to_type.get(&rel.target_id) {
                                            if ot == object_var2 {
                                                if let Some(q) = qualifier {
                                                    if rel.qualifier == *q {
                                                        found = true;
                                                        break;
                                                    }
                                                } else {
                                                    found = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if !found {
                                violations.push(format!(
                                    "O2O relation violation: Object '{}' (id: {}) does not have a relationship to '{}' with qualifier '{:?}'",
                                    object_var1, obj.id, object_var2, qualifier
                                ));
                            }
                        }
                    }
                }
                wasm4pm_compat::ocpq::PredicateKind::TimeBetweenEvents { event_var1, event_var2, t_min, t_max } => {
                    for (obj_id, ev_list) in &events_by_object {
                        for i in 0..ev_list.len() {
                            let ev1 = ev_list[i].1;
                            if ev1.event_type == *event_var1 {
                                // Find next ev2 of event_var2
                                for j in (i + 1)..ev_list.len() {
                                    let ev2 = ev_list[j].1;
                                    if ev2.event_type == *event_var2 {
                                        let t1 = crate::models::parse_timestamp_ms(&ev1.timestamp).unwrap_or(0);
                                        let t2 = crate::models::parse_timestamp_ms(&ev2.timestamp).unwrap_or(0);
                                        let diff = (t2 - t1).max(0) as u64;
                                        if diff < *t_min || diff > *t_max {
                                            violations.push(format!(
                                                "TBE violation: Duration between '{}' (id: {}) and '{}' (id: {}) on object {} is {}ms, expected [{}, {}]",
                                                event_var1, ev1.id, event_var2, ev2.id, obj_id, diff, t_min, t_max
                                            ));
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                wasm4pm_compat::ocpq::PredicateKind::Cardinality { min, max } => {
                    for (obj_id, ev_list) in &events_by_object {
                        let count = ev_list.len();
                        if count < *min || count > *max {
                            violations.push(format!(
                                "Cardinality violation: Object {} has {} related events, expected [{}, {}]",
                                obj_id, count, min, max
                            ));
                        }
                    }
                }
                wasm4pm_compat::ocpq::PredicateKind::ChildSetBound { branch_label, min, max } => {
                    // Count relations matching branch_label
                    for obj in &ocel.objects {
                        let count = obj.embedded_relations.iter().filter(|r| r.qualifier == *branch_label).count();
                        if count < *min || count > *max {
                            violations.push(format!(
                                "ChildSetBound violation: Object {} has {} relations for branch {}, expected [{}, {}]",
                                obj.id, count, branch_label, min, max
                            ));
                        }
                    }
                }
                _ => {} // Other kinds can be ignored or handled as noop
            }
        }

        let status = if violations.is_empty() {
            "Allow".to_string()
        } else {
            "Deny".to_string()
        };

        OcpqVerdict { status, violations }
    }

    pub fn evaluate_compat_const<const KIND: wasm4pm_compat::ocpq::OcpqScopeKind>(
        ocel: &OCEL,
        query: &wasm4pm_compat::ocpq::OcpqQueryConst<KIND>,
    ) -> OcpqVerdict {
        // Convert OcpqQueryConst to OcpqQuery dynamically
        let compat_query = wasm4pm_compat::ocpq::OcpqQuery {
            scope: wasm4pm_compat::ocpq::ObjectScope {
                object_types: query.scope().object_types().to_vec(),
            },
            predicates: query.predicates().to_vec(),
            sub_queries: query.sub_queries().iter().map(|sq| {
                wasm4pm_compat::ocpq::OcpqQuery {
                    scope: wasm4pm_compat::ocpq::ObjectScope {
                        object_types: sq.scope().object_types().to_vec(),
                    },
                    predicates: sq.predicates().to_vec(),
                    sub_queries: Vec::new(),
                }
            }).collect(),
        };
        Self::evaluate_compat(ocel, &compat_query)
    }
}

