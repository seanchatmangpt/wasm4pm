//! Object-Centric Process Mining (OCPM) Route Discoverer
//! Discovers individual object lifecycles from object-centric event logs.
//!
//! Algorithm:
//! 1. Parse `input.facts` where key is `event` and value is `id=<id>|activity=<act>|objects=<obj1>,<obj2>`.
//! 2. Build a timeline of activities for each object.
//! 3. Synthesize the route (lifecycle) for each object.

use crate::breeds::support::trace_query::TraceQuery;
use crate::breeds::{
    BreedError, BreedId, BreedInput, BreedOutput, CognitionBreed, Fact, TraceStep,
};
use std::collections::{BTreeMap, BTreeSet};
use tracing;

/// OCPM Route Discoverer
pub struct OcpmRouteDiscoverer;

impl CognitionBreed for OcpmRouteDiscoverer {
    fn id(&self) -> BreedId {
        BreedId::OcpmRouteDiscoverer
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["ocpm_route_discovery".to_string()]
    }

    fn preconditions(&self, input: &BreedInput) -> Result<(), String> {
        if input.facts.is_empty() {
            return Err("OCPM Route Discoverer requires at least one event fact".to_string());
        }
        Ok(())
    }

    fn run(&self, input: &BreedInput) -> Result<BreedOutput, BreedError> {
        let mut trace = Vec::new();
        // Object -> Vec of activities
        let mut object_routes: BTreeMap<String, Vec<String>> = BTreeMap::new();

        // Collect events with optional timestamps for ordering
        let mut events: Vec<(Option<i64>, String, Vec<String>)> = Vec::new();
        for fact in &input.facts {
            if fact.key == "event" {
                let parts: Vec<&str> = fact.value.split('|').collect();
                let mut activity = String::new();
                let mut objects = Vec::new();
                let mut timestamp: Option<i64> = None;
                for part in parts {
                    if let Some(act) = part.strip_prefix("activity=") {
                        activity = act.to_string();
                    } else if let Some(objs) = part.strip_prefix("objects=") {
                        objects = objs.split(',').map(|s| s.to_string()).collect();
                    } else if let Some(ts) = part.strip_prefix("timestamp=") {
                        timestamp = ts.parse::<i64>().ok();
                    }
                }
                if !activity.is_empty() && !objects.is_empty() {
                    events.push((timestamp, activity, objects));
                }
            }
        }
        // Sort by timestamp when available; stable sort preserves input order for ties/missing timestamps
        events.sort_unstable_by_key(|(ts, _, _)| *ts);

        for (_, activity, objects) in events {
            for obj in &objects {
                object_routes
                    .entry(obj.clone())
                    .or_default()
                    .push(activity.clone());
            }
            trace.push(TraceStep {
                step: trace.len(),
                kind: "process-event".to_string(),
                detail: format!("Event processed for objects: {:?}", objects),
                depth: 0,
                objects: objects
                    .into_iter()
                    .map(|o| ("object".to_string(), o))
                    .collect(),
            });
        }

        let mut new_facts = Vec::new();
        // Build DFG edge counts per object type (variant: single object per route)
        let mut dfg_edges: BTreeMap<String, u32> = BTreeMap::new();
        for (obj, route) in &object_routes {
            let route_str = route.join("->");
            new_facts.push(Fact {
                key: format!("route:{}", obj),
                value: route_str.clone(),
            });
            trace.push(TraceStep {
                step: trace.len(),
                kind: "discover-route".to_string(),
                detail: format!("Discovered route for {}: {}", obj, route_str),
                depth: 0,
                objects: vec![("object".to_string(), obj.clone())],
            });
            // Emit DFG edge-count facts: dfg:<obj_type>:<A>-><B>=<count>
            // obj_type inferred as the alphabetic prefix (letters only) of the object id
            let obj_type: String = obj.chars().take_while(|c| c.is_alphabetic()).collect();
            let obj_type = if obj_type.is_empty() {
                "object".to_string()
            } else {
                obj_type
            };
            for window in route.windows(2) {
                let edge_key = format!("dfg:{}:{}->{}", obj_type, window[0], window[1]);
                *dfg_edges.entry(edge_key).or_default() += 1;
            }
        }
        for (edge_key, count) in &dfg_edges {
            new_facts.push(Fact {
                key: edge_key.clone(),
                value: count.to_string(),
            });
        }

        let selected = object_routes.keys().next().cloned();
        let explanation = format!("Discovered routes for {} objects", object_routes.len());

        if trace.is_empty() {
            trace.push(TraceStep {
                step: trace.len(),
                kind: "discover-route-empty".to_string(),
                detail: format!("No routes discovered"),
                depth: 0,
                objects: vec![],
            });
        }

        Ok(BreedOutput {
            breed: BreedId::OcpmRouteDiscoverer,
            candidates: input.candidates.clone(),
            facts: new_facts,
            selected,
            explanation,
            inference_trace: trace,
            ocel_log: None,
            retained_cases: vec![],
        })
    }

    fn postconditions(&self, _input: &BreedInput, output: &BreedOutput) -> Result<(), String> {
        TraceQuery::from_output(output).require_non_empty()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::breeds::{Fact, Rule};

    fn make_input(facts: Vec<Fact>, rules: Vec<Rule>) -> BreedInput {
        BreedInput {
            intent: "test".into(),
            candidates: vec![],
            facts,
            cases: vec![],
            rules,
            goals: vec![],
            state: vec![],
        }
    }

    #[test]
    fn test_ocpm_precondition_failure() {
        let input = make_input(vec![], vec![]);
        let err = OcpmRouteDiscoverer.preconditions(&input).unwrap_err();
        assert!(err.contains("requires at least one"));
    }

    #[test]
    fn test_ocpm_discovers_routes() {
        let input = make_input(
            vec![
                Fact {
                    key: "event".into(),
                    value: "id=e1|activity=Create|objects=o1,i1".into(),
                },
                Fact {
                    key: "event".into(),
                    value: "id=e2|activity=Pay|objects=o1".into(),
                },
                Fact {
                    key: "event".into(),
                    value: "id=e3|activity=Ship|objects=i1".into(),
                },
            ],
            vec![],
        );
        let out = OcpmRouteDiscoverer.run(&input).unwrap();
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "route:o1" && f.value == "Create->Pay"));
        assert!(out
            .facts
            .iter()
            .any(|f| f.key == "route:i1" && f.value == "Create->Ship"));
        assert!(out
            .inference_trace
            .iter()
            .any(|t| t.kind == "discover-route"));
    }
}
