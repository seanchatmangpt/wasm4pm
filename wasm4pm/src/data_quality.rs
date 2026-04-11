use crate::models::{parse_timestamp_ms, *};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

/// Check data quality of an EventLog for common issues
#[wasm_bindgen]
pub fn check_data_quality(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut issues = Vec::new();
            let mut missing_attrs: HashMap<String, usize> = HashMap::new();
            let mut has_ordering_issues = false;
            let mut has_duplicates = false;

            // Scan all traces
            for trace in &log.traces {
                let trace_id = trace
                    .attributes
                    .get("case_id")
                    .or_else(|| trace.attributes.get("id"))
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();

                // Check for empty traces
                if trace.events.is_empty() {
                    issues.push(json!({
                        "type": "empty_trace",
                        "trace_id": trace_id
                    }));
                    continue;
                }

                // Check for timestamp ordering and invalid timestamps
                let mut prev_timestamp: Option<i64> = None;
                let mut event_signatures: HashMap<(String, String, String), usize> = HashMap::new();

                for (idx, event) in trace.events.iter().enumerate() {
                    // Check for missing values
                    if !event.attributes.contains_key(activity_key) {
                        *missing_attrs.entry(activity_key.to_string()).or_insert(0) += 1;
                    }
                    if !event.attributes.contains_key(timestamp_key) {
                        *missing_attrs.entry(timestamp_key.to_string()).or_insert(0) += 1;
                    }

                    // Validate and parse timestamp
                    if let Some(ts_val) = event.attributes.get(timestamp_key) {
                        if let Some(ts_str) = ts_val.as_string() {
                            if let Some(ts_ms) = parse_timestamp_ms(ts_str) {
                                // Check ordering
                                if let Some(prev) = prev_timestamp {
                                    if ts_ms < prev && !has_ordering_issues {
                                        issues.push(json!({
                                            "type": "timestamp_ordering",
                                            "trace_id": trace_id,
                                            "event_indices": [idx - 1, idx]
                                        }));
                                        has_ordering_issues = true;
                                    }
                                }
                                prev_timestamp = Some(ts_ms);
                            } else {
                                issues.push(json!({
                                    "type": "invalid_timestamp",
                                    "trace_id": trace_id,
                                    "event_index": idx,
                                    "value": ts_str
                                }));
                            }
                        }
                    }

                    // Build signature for duplicate detection (activity + timestamp + key attributes)
                    let activity = event
                        .attributes
                        .get(activity_key)
                        .and_then(|v| v.as_string())
                        .unwrap_or("unknown");
                    let timestamp = event
                        .attributes
                        .get(timestamp_key)
                        .and_then(|v| v.as_string())
                        .unwrap_or("unknown");
                    // Sort attributes by key to ensure deterministic hashing
                    let mut sorted_attrs: Vec<_> = event.attributes.iter().collect();
                    sorted_attrs.sort_by_key(|(k, _)| k.as_str());
                    let sig = (
                        activity.to_string(),
                        timestamp.to_string(),
                        format!("{:?}", sorted_attrs),
                    );

                    *event_signatures.entry(sig).or_insert(0) += 1;
                }

                // Report duplicates
                for (_, count) in event_signatures {
                    if count > 1 && !has_duplicates {
                        issues.push(json!({
                            "type": "duplicate_events",
                            "trace_id": trace_id,
                            "count": count
                        }));
                        has_duplicates = true;
                    }
                }
            }

            // Add missing value issues
            for (attr, count) in missing_attrs.iter() {
                issues.push(json!({
                    "type": "missing_value",
                    "attribute": attr,
                    "event_count": count
                }));
            }

            let valid = issues.is_empty();
            let result = json!({
                "valid": valid,
                "issues": issues,
                "total_issues": issues.len()
            });

            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Check data quality of an OCEL
#[wasm_bindgen]
pub fn check_ocel_data_quality(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut issues = Vec::new();

            // Build set of valid object IDs
            let valid_object_ids: HashSet<String> =
                ocel.objects.iter().map(|o| o.id.clone()).collect();

            // Check referential integrity: events reference existing objects
            for event in &ocel.events {
                for obj_id in event.all_object_ids() {
                    if !valid_object_ids.contains(obj_id) {
                        issues.push(json!({
                            "type": "missing_object_reference",
                            "event_id": event.id,
                            "object_id": obj_id
                        }));
                    }
                }
            }

            // Check for orphan objects (objects not referenced by any event)
            let mut referenced_objects = HashSet::new();
            for event in &ocel.events {
                for obj_id in event.all_object_ids() {
                    referenced_objects.insert(obj_id.to_string());
                }
            }

            for object in &ocel.objects {
                if !referenced_objects.contains(&object.id) {
                    issues.push(json!({
                        "type": "orphan_object",
                        "object_id": object.id,
                        "object_type": object.object_type
                    }));
                }
            }

            // Check object relations: verify both source and target exist
            for relation in &ocel.object_relations {
                if !valid_object_ids.contains(&relation.source_id) {
                    issues.push(json!({
                        "type": "invalid_relation_source",
                        "source_id": relation.source_id,
                        "target_id": relation.target_id
                    }));
                }
                if !valid_object_ids.contains(&relation.target_id) {
                    issues.push(json!({
                        "type": "invalid_relation_target",
                        "source_id": relation.source_id,
                        "target_id": relation.target_id
                    }));
                }
            }

            // Check timestamp consistency: events and objects should have valid timestamps
            for event in &ocel.events {
                if parse_timestamp_ms(&event.timestamp).is_none() {
                    issues.push(json!({
                        "type": "invalid_event_timestamp",
                        "event_id": event.id,
                        "value": event.timestamp
                    }));
                }
            }

            for object in &ocel.objects {
                for change in &object.changes {
                    if parse_timestamp_ms(&change.timestamp).is_none() {
                        issues.push(json!({
                            "type": "invalid_object_timestamp",
                            "object_id": object.id,
                            "value": change.timestamp
                        }));
                    }
                }
            }

            let valid = issues.is_empty();
            let result = json!({
                "valid": valid,
                "issues": issues,
                "total_issues": issues.len()
            });

            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

/// Infer schema from EventLog by analyzing attribute patterns
#[wasm_bindgen]
pub fn infer_eventlog_schema(log_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Collect all attributes and their value distributions
            let mut attr_stats: HashMap<String, AttributeStats> = HashMap::new();

            // Process log-level attributes
            for (key, val) in &log.attributes {
                attr_stats.entry(key.clone()).or_default().observe(val);
            }

            // Process trace-level and event-level attributes
            for trace in &log.traces {
                for (key, val) in &trace.attributes {
                    attr_stats.entry(key.clone()).or_default().observe(val);
                }
                for event in &trace.events {
                    for (key, val) in &event.attributes {
                        attr_stats.entry(key.clone()).or_default().observe(val);
                    }
                }
            }

            // Infer keys based on patterns
            let activity_key = infer_activity_key(&attr_stats);
            let timestamp_key = infer_timestamp_key(&attr_stats);
            let resource_key = infer_resource_key(&attr_stats);
            let case_id_key = infer_case_id_key(log, &attr_stats);

            // Build attribute types map
            let mut attribute_types: HashMap<String, String> = HashMap::new();
            for (key, stats) in attr_stats {
                attribute_types.insert(key, stats.infer_type());
            }

            // Estimate confidence (high if we found strong candidates)
            let confidence = if activity_key.is_some() && timestamp_key.is_some() {
                0.95
            } else if activity_key.is_some() || timestamp_key.is_some() {
                0.70
            } else {
                0.40
            };

            let result = json!({
                "inferred_keys": {
                    "activity_key": activity_key.unwrap_or_else(|| "activity".to_string()),
                    "timestamp_key": timestamp_key.unwrap_or_else(|| "timestamp".to_string()),
                    "resource_key": resource_key.unwrap_or_else(|| "performer".to_string()),
                    "case_id_key": case_id_key.unwrap_or_else(|| "case_id".to_string())
                },
                "attribute_types": attribute_types,
                "confidence": confidence
            });

            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Infer schema from OCEL
#[wasm_bindgen]
pub fn infer_ocel_schema(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            // Event type distribution
            let mut event_types: HashMap<String, usize> = HashMap::new();
            for event in &ocel.events {
                *event_types.entry(event.event_type.clone()).or_insert(0) += 1;
            }

            // Object type distribution
            let mut object_types: HashMap<String, usize> = HashMap::new();
            for object in &ocel.objects {
                *object_types.entry(object.object_type.clone()).or_insert(0) += 1;
            }

            // Relationship patterns (source_type -> target_type counts)
            let mut relationships: HashMap<(String, String), usize> = HashMap::new();
            for relation in &ocel.object_relations {
                // Find types of source and target objects
                let source_type = ocel
                    .objects
                    .iter()
                    .find(|o| o.id == relation.source_id)
                    .map(|o| o.object_type.clone());
                let target_type = ocel
                    .objects
                    .iter()
                    .find(|o| o.id == relation.target_id)
                    .map(|o| o.object_type.clone());

                if let (Some(st), Some(tt)) = (source_type, target_type) {
                    *relationships.entry((st, tt)).or_insert(0) += 1;
                }
            }

            // Build common_relationships list sorted by frequency
            let mut common_rels: Vec<_> = relationships.into_iter().collect();
            common_rels.sort_by(|a, b| b.1.cmp(&a.1));
            let common_relationships: Vec<Value> = common_rels
                .into_iter()
                .map(|((src, tgt), cnt)| {
                    json!({
                        "source_type": src,
                        "target_type": tgt,
                        "count": cnt
                    })
                })
                .collect();

            // Analyze event-object qualifiers (co-occurrence patterns)
            let mut qualifiers: HashMap<String, usize> = HashMap::new();
            for event in &ocel.events {
                for obj_ref in &event.object_refs {
                    *qualifiers.entry(obj_ref.qualifier.clone()).or_insert(0) += 1;
                }
            }

            let result = json!({
                "event_types": event_types,
                "object_types": object_types,
                "common_relationships": common_relationships,
                "event_object_qualifiers": qualifiers,
                "total_events": ocel.events.len(),
                "total_objects": ocel.objects.len(),
                "total_relations": ocel.object_relations.len()
            });

            to_js(&result)
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

// === Helper Structures and Functions ===

/// Statistics about attribute values to support type inference
#[derive(Debug, Clone, Default)]
struct AttributeStats {
    count: usize,
    is_string: usize,
    is_numeric: usize,
    is_boolean: usize,
    is_date: usize,
    sample_values: Vec<String>,
}

impl AttributeStats {
    fn observe(&mut self, val: &AttributeValue) {
        self.count += 1;
        match val {
            AttributeValue::String(s) => {
                self.is_string += 1;
                if self.sample_values.len() < 3 {
                    self.sample_values.push(s.clone());
                }
            }
            AttributeValue::Int(_) => self.is_numeric += 1,
            AttributeValue::Float(_) => self.is_numeric += 1,
            AttributeValue::Date(s) => {
                self.is_date += 1;
                if self.sample_values.len() < 3 {
                    self.sample_values.push(s.clone());
                }
            }
            AttributeValue::Boolean(_) => self.is_boolean += 1,
            _ => {}
        }
    }

    fn infer_type(&self) -> String {
        if self.count == 0 {
            return "unknown".to_string();
        }

        // Determine type based on dominant value kind
        let total = self.count as f64;
        let pct_numeric = self.is_numeric as f64 / total;
        let pct_date = self.is_date as f64 / total;
        let pct_boolean = self.is_boolean as f64 / total;

        if pct_boolean > 0.8 {
            "boolean".to_string()
        } else if pct_date > 0.8 {
            "datetime".to_string()
        } else if pct_numeric > 0.8 {
            "numeric".to_string()
        } else {
            "string".to_string()
        }
    }
}

/// Infer activity key by looking for attributes with many unique values and common names
fn infer_activity_key(attr_stats: &HashMap<String, AttributeStats>) -> Option<String> {
    let activity_keywords = ["activity", "event", "action", "task", "event_type", "type"];

    // First try exact keyword matches
    for keyword in &activity_keywords {
        if attr_stats.contains_key(*keyword) {
            return Some(keyword.to_string());
        }
    }

    // Then try case-insensitive substring matches
    for key in attr_stats.keys() {
        for keyword in &activity_keywords {
            if key.to_lowercase().contains(keyword) {
                return Some(key.clone());
            }
        }
    }

    None
}

/// Infer timestamp key by looking for datetime attributes or common timestamp names
fn infer_timestamp_key(attr_stats: &HashMap<String, AttributeStats>) -> Option<String> {
    let timestamp_keywords = ["timestamp", "time", "date", "start_time", "end_time", "ts"];

    // First pass: look for attributes with high date type density
    let mut date_candidates: Vec<(String, usize)> = attr_stats
        .iter()
        .filter(|(_, stats)| stats.is_date > 0)
        .map(|(k, stats)| (k.clone(), stats.is_date))
        .collect();
    date_candidates.sort_by(|a, b| b.1.cmp(&a.1));

    if let Some((key, _)) = date_candidates.first() {
        return Some(key.clone());
    }

    // Second pass: try keyword matching
    for keyword in &timestamp_keywords {
        if attr_stats.contains_key(*keyword) {
            return Some(keyword.to_string());
        }
    }

    for key in attr_stats.keys() {
        for keyword in &timestamp_keywords {
            if key.to_lowercase().contains(keyword) {
                return Some(key.clone());
            }
        }
    }

    None
}

/// Infer resource key by looking for high-cardinality string attributes
fn infer_resource_key(attr_stats: &HashMap<String, AttributeStats>) -> Option<String> {
    let resource_keywords = [
        "resource",
        "performer",
        "user",
        "agent",
        "executor",
        "responsible",
    ];

    // First try exact keyword matches
    for keyword in &resource_keywords {
        if attr_stats.contains_key(*keyword) {
            return Some(keyword.to_string());
        }
    }

    // Then try case-insensitive substring matches
    for key in attr_stats.keys() {
        for keyword in &resource_keywords {
            if key.to_lowercase().contains(keyword) {
                return Some(key.clone());
            }
        }
    }

    // Fallback: find string attribute with moderate cardinality (not too few, not too many)
    let mut candidates: Vec<(String, usize)> = attr_stats
        .iter()
        .filter(|(_, stats)| stats.is_string > stats.count / 2)
        .map(|(k, stats)| (k.clone(), stats.is_string))
        .collect();
    candidates.sort_by(|a, b| b.1.cmp(&a.1));

    candidates.first().map(|(k, _)| k.clone())
}

/// Infer case ID key by matching trace attributes to log structure
fn infer_case_id_key(
    log: &EventLog,
    attr_stats: &HashMap<String, AttributeStats>,
) -> Option<String> {
    let case_keywords = [
        "case_id",
        "case",
        "trace_id",
        "id",
        "process_id",
        "instance",
    ];

    // First try exact keyword matches
    for keyword in &case_keywords {
        if attr_stats.contains_key(*keyword) {
            return Some(keyword.to_string());
        }
    }

    // Then try case-insensitive substring matches in trace attributes
    for trace in &log.traces {
        for key in trace.attributes.keys() {
            for keyword in &case_keywords {
                if key.to_lowercase().contains(keyword) {
                    return Some(key.clone());
                }
            }
        }
    }

    None
}
