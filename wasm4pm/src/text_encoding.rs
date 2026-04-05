use crate::state::{get_or_init_state, StoredObject};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

/// Convert a DirectlyFollowsGraph to human-readable English text
/// Describes activities, start/end activities, and edge paths with percentages
#[wasm_bindgen]
pub fn encode_dfg_as_text(dfg_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(dfg_handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            if dfg.nodes.is_empty() {
                return Ok("The process contains 0 activities. No flows detected.".to_string());
            }

            let mut text = String::new();

            // Activity count and list
            let activity_count = dfg.nodes.len();
            text.push_str(&format!(
                "The process contains {} activities: ",
                activity_count
            ));
            let activities: Vec<String> = dfg.nodes.iter().map(|n| n.label.clone()).collect();
            text.push_str(&activities.join(", "));
            text.push_str(".\n");

            // Calculate total start count
            let total_starts: usize = dfg.start_activities.values().sum();

            // Start activities
            if !dfg.start_activities.is_empty() {
                text.push_str("- Process starts with ");
                let starts: Vec<String> = dfg
                    .start_activities
                    .iter()
                    .map(|(activity, count)| {
                        let pct = if total_starts > 0 {
                            (*count as f64 / total_starts as f64) * 100.0
                        } else {
                            0.0
                        };
                        format!("{} ({} cases, {:.1}%)", activity, count, pct)
                    })
                    .collect();
                text.push_str(&starts.join("; "));
                text.push_str(".\n");
            }

            // Edges (directly-follows relations)
            let mut edges_by_from: HashMap<String, Vec<(String, usize)>> = HashMap::new();
            for edge in &dfg.edges {
                edges_by_from
                    .entry(edge.from.clone())
                    .or_insert_with(Vec::new)
                    .push((edge.to.clone(), edge.frequency));
            }

            for (from_activity, outgoing) in edges_by_from.iter() {
                let total_outgoing: usize = outgoing.iter().map(|(_, freq)| freq).sum();
                text.push_str(&format!("- From {}: ", from_activity));

                let paths: Vec<String> = outgoing
                    .iter()
                    .map(|(to, freq)| {
                        let pct = if total_outgoing > 0 {
                            (*freq as f64 / total_outgoing as f64) * 100.0
                        } else {
                            0.0
                        };
                        format!("{} cases ({:.1}%) proceed to {}", freq, pct, to)
                    })
                    .collect();
                text.push_str(&paths.join(", "));
                text.push_str(".\n");
            }

            // End activities
            if !dfg.end_activities.is_empty() {
                let total_ends: usize = dfg.end_activities.values().sum();
                text.push_str("- Process ends with ");
                let ends: Vec<String> = dfg
                    .end_activities
                    .iter()
                    .map(|(activity, count)| {
                        let pct = if total_ends > 0 {
                            (*count as f64 / total_ends as f64) * 100.0
                        } else {
                            0.0
                        };
                        format!("{} ({:.1}% of cases)", activity, pct)
                    })
                    .collect();
                text.push_str(&ends.join("; "));
                text.push_str(".");
            }

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not a DirectlyFollowsGraph")),
        None => Err(JsValue::from_str("DirectlyFollowsGraph not found")),
    })
}

/// Convert top process variants to human-readable text
/// Lists the most common execution sequences with case counts and percentages
#[wasm_bindgen]
pub fn encode_variants_as_text(
    log_handle: &str,
    activity_key: &str,
    top_n: usize,
) -> Result<String, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            if log.traces.is_empty() {
                return Ok("No process variants found (empty event log).".to_string());
            }

            // Extract trace sequences
            let mut variants: HashMap<Vec<String>, usize> = HashMap::new();
            for trace in &log.traces {
                let mut sequence = Vec::new();
                for event in &trace.events {
                    if let Some(activity) = event
                        .attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                    {
                        sequence.push(activity.to_string());
                    }
                }
                if !sequence.is_empty() {
                    *variants.entry(sequence).or_insert(0) += 1;
                }
            }

            let total_cases = log.traces.len() as f64;
            let mut sorted_variants: Vec<_> = variants.into_iter().collect();
            sorted_variants.sort_by(|a, b| b.1.cmp(&a.1)); // Sort by frequency descending

            let mut text = format!(
                "Top {} process variants:\n",
                top_n.min(sorted_variants.len())
            );

            for (idx, (sequence, count)) in sorted_variants.iter().take(top_n).enumerate() {
                let pct = (*count as f64 / total_cases) * 100.0;
                let variant_str = sequence.join(" → ");
                text.push_str(&format!(
                    "{}. {} ({} cases, {:.1}%)\n",
                    idx + 1,
                    variant_str,
                    count,
                    pct
                ));
            }

            Ok(text.trim_end().to_string())
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Convert event log statistics to human-readable summary text
#[wasm_bindgen]
pub fn encode_statistics_as_text(log_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let case_count = log.case_count();
            let event_count = log.event_count();
            let avg_events_per_case = if case_count > 0 {
                event_count as f64 / case_count as f64
            } else {
                0.0
            };

            // Get activity frequencies (using a default activity key)
            let activity_key = "concept:name";
            let activities = log.get_activities(activity_key);
            let unique_activities = activities.len();

            // Count frequency per activity
            let mut activity_freqs: HashMap<String, usize> = HashMap::new();
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(activity) = event
                        .attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                    {
                        *activity_freqs.entry(activity.to_string()).or_insert(0) += 1;
                    }
                }
            }

            let mut freq_pairs: Vec<_> = activity_freqs.into_iter().collect();
            freq_pairs.sort_by(|a, b| b.1.cmp(&a.1)); // Sort by frequency descending

            let mut text = String::from("Process log summary:\n");
            text.push_str(&format!("- Total cases: {}\n", case_count));
            text.push_str(&format!("- Total events: {}\n", event_count));
            text.push_str(&format!(
                "- Average events per case: {:.2}\n",
                avg_events_per_case
            ));
            text.push_str(&format!("- Unique activities: {}\n", unique_activities));

            text.push_str("- Activity frequencies: ");
            let freq_strs: Vec<String> = freq_pairs
                .iter()
                .map(|(activity, freq)| format!("{} ({})", activity, freq))
                .collect();
            text.push_str(&freq_strs.join(", "));

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Convert conformance check results (as JSON string) to human-readable text
/// Expected JSON format:
/// {
///   "conforming_cases": 95,
///   "non_conforming_cases": 5,
///   "total_cases": 100,
///   "average_fitness": 0.98
/// }
#[wasm_bindgen]
pub fn encode_conformance_as_text(result_json: &str) -> Result<String, JsValue> {
    let result: Value = serde_json::from_str(result_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

    let conforming = result["conforming_cases"].as_u64().unwrap_or(0) as usize;
    let non_conforming = result["non_conforming_cases"].as_u64().unwrap_or(0) as usize;
    let total = result["total_cases"].as_u64().unwrap_or(1) as usize;
    let avg_fitness = result["average_fitness"].as_f64().unwrap_or(0.0);

    let conforming_pct = if total > 0 {
        (conforming as f64 / total as f64) * 100.0
    } else {
        0.0
    };
    let non_conforming_pct = 100.0 - conforming_pct;

    let mut text = String::from("Conformance analysis:\n");
    text.push_str(&format!("- Total cases checked: {}\n", total));
    text.push_str(&format!(
        "- Conforming cases: {} ({:.1}%)\n",
        conforming, conforming_pct
    ));
    text.push_str(&format!(
        "- Non-conforming cases: {} ({:.1}%)\n",
        non_conforming, non_conforming_pct
    ));
    text.push_str(&format!("- Average case fitness: {:.2}", avg_fitness));

    Ok(text)
}

/// Convert bottleneck analysis results (as JSON string) to human-readable text
/// Expected JSON format:
/// {
///   "bottlenecks": [
///     {"activity": "Approve", "avg_duration_hours": 2.5, "delayed_cases": 85},
///     {"activity": "Close", "avg_duration_hours": 1.2, "delayed_cases": 20},
///     {"activity": "Register", "avg_duration_hours": 0.1, "delayed_cases": 0}
///   ]
/// }
#[wasm_bindgen]
pub fn encode_bottlenecks_as_text(result_json: &str) -> Result<String, JsValue> {
    let result: Value = serde_json::from_str(result_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

    let bottlenecks = result["bottlenecks"]
        .as_array()
        .ok_or_else(|| JsValue::from_str("Expected 'bottlenecks' array in JSON"))?;

    if bottlenecks.is_empty() {
        return Ok("Bottleneck analysis:\n- No bottlenecks detected.".to_string());
    }

    let mut text = String::from("Bottleneck analysis:\n");

    for (idx, bn) in bottlenecks.iter().enumerate() {
        let activity = bn["activity"].as_str().unwrap_or("Unknown");
        let duration = bn["avg_duration_hours"].as_f64().unwrap_or(0.0);
        let delayed = bn["delayed_cases"].as_u64().unwrap_or(0) as usize;

        if idx == 0 {
            text.push_str(&format!(
                "- Slowest activity: {} (avg {:.1} hours, {} cases delayed)\n",
                activity, duration, delayed
            ));
        } else if idx == 1 {
            text.push_str(&format!(
                "- Second slowest: {} (avg {:.1} hours, {} cases delayed)\n",
                activity, duration, delayed
            ));
        } else {
            text.push_str(&format!(
                "- {}: {} (avg {:.1} hours, {} cases delayed)\n",
                if delayed == 0 { "Fastest" } else { "Activity" },
                activity,
                duration,
                delayed
            ));
        }
    }

    Ok(text.trim_end().to_string())
}

/// Convert a Petri Net to human-readable text for LLM consumption
/// Includes places, transitions, arcs, and markings
#[wasm_bindgen]
pub fn encode_petri_net_as_text(petri_net_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => {
            if pn.places.is_empty() && pn.transitions.is_empty() {
                return Ok("Empty Petri Net (no places or transitions).".to_string());
            }

            let mut text = String::from("Petri Net:\n");

            // Places
            let place_labels: Vec<String> = pn
                .places
                .iter()
                .map(|p| {
                    if let Some(m) = p.marking {
                        if m > 0 {
                            return format!("{}({})", p.label, m);
                        }
                    }
                    p.label.clone()
                })
                .collect();
            text.push_str(&format!(
                "- Places ({}): [{}]\n",
                pn.places.len(),
                place_labels.join(", ")
            ));

            // Transitions
            let transition_labels: Vec<String> = pn
                .transitions
                .iter()
                .map(|t| {
                    if t.is_invisible.unwrap_or(false) {
                        format!("{}(silent)", t.label)
                    } else {
                        t.label.clone()
                    }
                })
                .collect();
            text.push_str(&format!(
                "- Transitions ({}): [{}]\n",
                pn.transitions.len(),
                transition_labels.join(", ")
            ));

            // Arcs
            if !pn.arcs.is_empty() {
                let arc_strs: Vec<String> = pn
                    .arcs
                    .iter()
                    .map(|a| {
                        let w = a.weight.unwrap_or(1);
                        if w > 1 {
                            format!("{}→{}(w={})", a.from, a.to, w)
                        } else {
                            format!("{}→{}", a.from, a.to)
                        }
                    })
                    .collect();
                text.push_str(&format!("- Arcs ({}): {}\n", pn.arcs.len(), arc_strs.join(", ")));
            }

            // Initial marking
            if !pn.initial_marking.is_empty() {
                let markings: Vec<String> = pn
                    .initial_marking
                    .iter()
                    .filter(|(_, &v)| v > 0)
                    .map(|(place, tokens)| format!("{}={}", place, tokens))
                    .collect();
                if !markings.is_empty() {
                    text.push_str(&format!("- Initial marking: {}\n", markings.join(", ")));
                }
            }

            // Final markings
            if !pn.final_markings.is_empty() {
                for (i, fm) in pn.final_markings.iter().enumerate() {
                    let markings: Vec<String> = fm
                        .iter()
                        .filter(|(_, &v)| v > 0)
                        .map(|(place, tokens)| format!("{}={}", place, tokens))
                        .collect();
                    if !markings.is_empty() {
                        if pn.final_markings.len() == 1 {
                            text.push_str(&format!("- Final marking: {}", markings.join(", ")));
                        } else {
                            text.push_str(&format!(
                                "- Final marking {}: {}",
                                i + 1,
                                markings.join(", ")
                            ));
                        }
                        if i < pn.final_markings.len() - 1 {
                            text.push('\n');
                        }
                    }
                }
            }

            Ok(text.trim_end().to_string())
        }
        Some(_) => Err(JsValue::from_str("Object is not a PetriNet")),
        None => Err(JsValue::from_str(&format!(
            "PetriNet '{}' not found",
            petri_net_handle
        ))),
    })
}

/// Convert OCEL to a concise text summary for LLM consumption
/// Includes event types, object types, counts, and relationships
#[wasm_bindgen]
pub fn encode_ocel_as_text(ocel_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            if ocel.events.is_empty() && ocel.objects.is_empty() {
                return Ok("Empty OCEL (no events or objects).".to_string());
            }

            let total_events = ocel.event_count();
            let total_objects = ocel.object_count();

            let mut text = format!(
                "OCEL: {} events, {} objects",
                total_events, total_objects
            );

            // Event types
            if !ocel.event_types.is_empty() {
                text.push_str(&format!(
                    ", {} event types ({})",
                    ocel.event_types.len(),
                    ocel.event_types.join(", ")
                ));
            }

            // Object types with counts
            if !ocel.object_types.is_empty() {
                let mut type_counts: HashMap<&str, usize> = HashMap::new();
                for obj in &ocel.objects {
                    *type_counts.entry(&obj.object_type).or_insert(0) += 1;
                }
                let type_strs: Vec<String> = ocel
                    .object_types
                    .iter()
                    .map(|ot| {
                        let count = type_counts.get(ot.as_str()).copied().unwrap_or(0);
                        format!("{} ({})", ot, count)
                    })
                    .collect();
                text.push_str(&format!(
                    ", {} object types: {}",
                    ocel.object_types.len(),
                    type_strs.join(", ")
                ));
            }

            // Relationships summary
            if !ocel.object_relations.is_empty() {
                let qualifiers: HashSet<&str> = ocel
                    .object_relations
                    .iter()
                    .map(|r| r.qualifier.as_str())
                    .collect();
                text.push_str(&format!(
                    "\n- {} object relations (qualifiers: {})",
                    ocel.object_relations.len(),
                    qualifiers.into_iter().collect::<Vec<_>>().join(", ")
                ));
            }

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str(&format!(
            "OCEL '{}' not found",
            ocel_handle
        ))),
    })
}

/// Convert an Object-Centric Petri Net (stored as JSON) to text
/// The OC Petri Net is stored as a JsonString containing per-type Petri Net structures
#[wasm_bindgen]
pub fn encode_oc_petri_net_as_text(oc_petri_net_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(oc_petri_net_handle, |obj| match obj {
        Some(StoredObject::JsonString(json_str)) => {
            let ocpn: Value = serde_json::from_str(json_str)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse OC Petri Net JSON: {}", e)))?;

            let obj_map = ocpn.as_object().ok_or_else(|| {
                JsValue::from_str("OC Petri Net JSON is not an object")
            })?;

            if obj_map.is_empty() {
                return Ok("Empty OC Petri Net (no object types).".to_string());
            }

            let mut text = format!("OC-Petri Net ({} object types):\n", obj_map.len());

            for (obj_type, net_json) in obj_map {
                let places = net_json["places"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|p| p["label"].as_str())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();

                let transitions = net_json["transitions"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|t| t["label"].as_str())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();

                let arc_count = net_json["arcs"]
                    .as_array()
                    .map(|arr| arr.len())
                    .unwrap_or(0);

                text.push_str(&format!("  {}:\n", obj_type));
                text.push_str(&format!(
                    "    Places ({}): [{}]\n",
                    places.len(),
                    places.join(", ")
                ));
                text.push_str(&format!(
                    "    Transitions ({}): [{}]\n",
                    transitions.len(),
                    transitions.join(", ")
                ));
                text.push_str(&format!("    Arcs: {}\n", arc_count));
            }

            Ok(text.trim_end().to_string())
        }
        Some(_) => Err(JsValue::from_str("Object is not an OC Petri Net (expected JsonString)")),
        None => Err(JsValue::from_str(&format!(
            "OC Petri Net '{}' not found",
            oc_petri_net_handle
        ))),
    })
}

/// Compare two process models (DFGs or Petri Nets) and produce a text diff
/// Highlights differences in structure, edges, and frequencies
#[wasm_bindgen]
pub fn encode_model_comparison_as_text(
    model1_handle: &str,
    model2_handle: &str,
) -> Result<String, JsValue> {
    let state = get_or_init_state();

    // Extract summary info from each model
    let m1 = extract_model_summary(state, model1_handle)?;
    let m2 = extract_model_summary(state, model2_handle)?;

    let mut text = format!("Model comparison: {} vs {}\n", m1.name, m2.name);

    // Node/place counts
    text.push_str(&format!(
        "- Nodes: {} vs {}\n",
        m1.node_count, m2.node_count
    ));
    text.push_str(&format!(
        "- Edges/Arcs: {} vs {}\n",
        m1.edges.len(),
        m2.edges.len()
    ));

    // Activities/nodes only in model 1
    let nodes1: HashSet<&str> = m1.nodes.iter().map(|s| s.as_str()).collect();
    let nodes2: HashSet<&str> = m2.nodes.iter().map(|s| s.as_str()).collect();

    let only_in_1: Vec<&&str> = nodes1.difference(&nodes2).collect();
    let only_in_2: Vec<&&str> = nodes2.difference(&nodes1).collect();

    if !only_in_1.is_empty() {
        let labels: Vec<&str> = only_in_1.into_iter().copied().collect();
        text.push_str(&format!("- Only in {}: {}\n", m1.name, labels.join(", ")));
    }
    if !only_in_2.is_empty() {
        let labels: Vec<&str> = only_in_2.into_iter().copied().collect();
        text.push_str(&format!("- Only in {}: {}\n", m2.name, labels.join(", ")));
    }

    // Edge differences
    let edges1: HashMap<(&str, &str), usize> = m1
        .edges
        .iter()
        .map(|(f, t, freq)| ((f.as_str(), t.as_str()), *freq))
        .collect();
    let edges2: HashMap<(&str, &str), usize> = m2
        .edges
        .iter()
        .map(|(f, t, freq)| ((f.as_str(), t.as_str()), *freq))
        .collect();

    let all_edge_keys: HashSet<(&str, &str)> = edges1.keys().chain(edges2.keys()).copied().collect();

    let mut diffs = Vec::new();
    for key in &all_edge_keys {
        let freq1 = edges1.get(key).copied().unwrap_or(0);
        let freq2 = edges2.get(key).copied().unwrap_or(0);
        if freq1 != freq2 {
            diffs.push((key, freq1, freq2));
        }
    }

    if !diffs.is_empty() {
        // Sort by largest absolute difference
        diffs.sort_by(|a, b| {
            let diff_a = (a.1 as i64 - a.2 as i64).unsigned_abs();
            let diff_b = (b.1 as i64 - b.2 as i64).unsigned_abs();
            diff_b.cmp(&diff_a)
        });
        text.push_str("- Edge differences:\n");
        for (edge, f1, f2) in diffs.iter().take(10) {
            text.push_str(&format!(
                "    {}→{}: {} vs {}\n",
                edge.0, edge.1, f1, f2
            ));
        }
        if diffs.len() > 10 {
            text.push_str(&format!("    ... and {} more differences\n", diffs.len() - 10));
        }
    } else {
        text.push_str("- No edge differences found.\n");
    }

    Ok(text.trim_end().to_string())
}

/// Internal helper: extract a uniform summary from a DFG or PetriNet stored object
struct ModelSummary {
    name: String,
    node_count: usize,
    nodes: Vec<String>,
    edges: Vec<(String, String, usize)>,
}

fn extract_model_summary(
    state: &crate::state::AppState,
    handle: &str,
) -> Result<ModelSummary, JsValue> {
    state.with_object(handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => Ok(ModelSummary {
            name: format!("DFG({})", handle),
            node_count: dfg.nodes.len(),
            nodes: dfg.nodes.iter().map(|n| n.label.clone()).collect(),
            edges: dfg
                .edges
                .iter()
                .map(|e| (e.from.clone(), e.to.clone(), e.frequency))
                .collect(),
        }),
        Some(StoredObject::PetriNet(pn)) => {
            // For Petri Nets, treat transitions as "nodes" and arcs as "edges"
            Ok(ModelSummary {
                name: format!("PetriNet({})", handle),
                node_count: pn.places.len() + pn.transitions.len(),
                nodes: pn
                    .places
                    .iter()
                    .map(|p| p.label.clone())
                    .chain(pn.transitions.iter().map(|t| t.label.clone()))
                    .collect(),
                edges: pn
                    .arcs
                    .iter()
                    .map(|a| (a.from.clone(), a.to.clone(), a.weight.unwrap_or(1)))
                    .collect(),
            })
        }
        Some(_) => Err(JsValue::from_str(&format!(
            "Object '{}' is not a DFG or PetriNet",
            handle
        ))),
        None => Err(JsValue::from_str(&format!(
            "Model '{}' not found",
            handle
        ))),
    })
}

/// Convert OCEL (Object-Centric Event Log) to human-readable summary text
#[wasm_bindgen]
pub fn encode_ocel_summary_as_text(ocel_handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut text = String::from("Object-centric process log summary:\n");

            // Object types and counts
            let object_type_count = ocel.object_types.len();
            text.push_str(&format!(
                "- Object types: {} ({})\n",
                object_type_count,
                ocel.object_types.join(", ")
            ));

            // Count objects by type
            let mut object_counts: HashMap<String, usize> = HashMap::new();
            for obj in &ocel.objects {
                *object_counts.entry(obj.object_type.clone()).or_insert(0) += 1;
            }

            for obj_type in &ocel.object_types {
                let count = object_counts.get(obj_type).cloned().unwrap_or(0);
                text.push_str(&format!("- {} instances: {}\n", obj_type, count));
            }

            // Event types and count
            let event_type_count = ocel.event_types.len();
            text.push_str(&format!(
                "- Event types: {} ({})\n",
                event_type_count,
                ocel.event_types.join(", ")
            ));

            let total_events = ocel.event_count();
            text.push_str(&format!("- Total events: {}", total_events));

            Ok(text)
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}
