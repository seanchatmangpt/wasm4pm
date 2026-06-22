//! Process-Model Registry core module.
//!
//! Provides the data structures, validation logic, and thread-safe in-memory cache
//! with LRU/TTL eviction policies and variant mapping.

use crate::error::{codes, wasm_err};
use crate::models::PetriNet;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use wasm_bindgen::prelude::*;

fn system_time_now() -> SystemTime {
    #[cfg(target_arch = "wasm32")]
    {
        SystemTime::UNIX_EPOCH
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        SystemTime::now()
    }
}

/// Supported process model representations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelType {
    #[serde(rename = "PNML")]
    PNML,
    #[serde(rename = "POWL")]
    POWL,
}

/// Envelopes wrapping raw process models with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessModelEnvelope {
    pub id: String,
    pub name: String,
    pub version: String,
    pub model_type: ModelType,
    pub payload: String,
    pub metadata: HashMap<String, String>,
}

/// Comparison operators for variant routing guards.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComparisonOp {
    Equals,
    NotEquals,
    Contains,
    GreaterThan,
    LessThan,
}

/// A conditional guard acting on variant properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionalGuard {
    pub attribute_name: String,
    pub operation: ComparisonOp,
    pub threshold: String,
}

impl ConditionalGuard {
    pub fn matches(&self, key: &VariantKey) -> bool {
        let Some(value) = key.attributes.get(&self.attribute_name) else {
            return false;
        };
        match self.operation {
            ComparisonOp::Equals => value == &self.threshold,
            ComparisonOp::NotEquals => value != &self.threshold,
            ComparisonOp::Contains => value.contains(&self.threshold),
            ComparisonOp::GreaterThan => {
                if let (Ok(v_num), Ok(t_num)) =
                    (value.parse::<f64>(), self.threshold.parse::<f64>())
                {
                    v_num > t_num
                } else {
                    value > &self.threshold
                }
            }
            ComparisonOp::LessThan => {
                if let (Ok(v_num), Ok(t_num)) =
                    (value.parse::<f64>(), self.threshold.parse::<f64>())
                {
                    v_num < t_num
                } else {
                    value < &self.threshold
                }
            }
        }
    }
}

/// Evaluated variant context payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantKey {
    pub attributes: HashMap<String, String>,
}

/// Rule determining how a variant is mapped to a process model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantRule {
    pub model_id: String,
    pub guards: Vec<ConditionalGuard>,
    pub priority: i32,
}

struct RegistryEntry {
    envelope: ProcessModelEnvelope,
    last_accessed: SystemTime,
    expires_at: Option<SystemTime>,
}

/// In-memory thread-safe registry cache.
pub struct ProcessModelRegistry {
    models: HashMap<String, RegistryEntry>,
    variant_rules: Vec<VariantRule>,
    capacity: usize,
}

impl ProcessModelRegistry {
    pub fn new(capacity: usize) -> Self {
        ProcessModelRegistry {
            models: HashMap::new(),
            variant_rules: Vec::new(),
            capacity,
        }
    }

    pub fn clear(&mut self) {
        self.models.clear();
        self.variant_rules.clear();
    }

    pub fn get(&mut self, id: &str) -> Option<ProcessModelEnvelope> {
        let now = system_time_now();
        if let Some(entry) = self.models.get(id) {
            if let Some(exp) = entry.expires_at {
                if now > exp {
                    self.models.remove(id);
                    return None;
                }
            }
        } else {
            return None;
        }

        if let Some(entry) = self.models.get_mut(id) {
            entry.last_accessed = now;
            Some(entry.envelope.clone())
        } else {
            None
        }
    }

    pub fn get_without_expiry(&self, id: &str) -> Option<ProcessModelEnvelope> {
        self.models.get(id).map(|entry| entry.envelope.clone())
    }

    pub fn insert(
        &mut self,
        envelope: ProcessModelEnvelope,
        ttl: Option<Duration>,
    ) -> Result<(), &'static str> {
        let now = system_time_now();
        let expires_at = ttl.map(|d| now + d);

        // Remove expired entries
        let expired: Vec<String> = self
            .models
            .iter()
            .filter(|(_, e)| e.expires_at.is_some_and(|exp| now > exp))
            .map(|(k, _)| k.clone())
            .collect();
        for k in expired {
            self.models.remove(&k);
        }

        // Enforce capacity limit (max capacity entries)
        if self.models.len() >= self.capacity && !self.models.contains_key(&envelope.id) {
            let lru_key = self
                .models
                .iter()
                .min_by_key(|(_, entry)| entry.last_accessed)
                .map(|(k, _)| k.clone());
            if let Some(k) = lru_key {
                self.models.remove(&k);
            } else {
                return Err("LIMIT_EXCEEDED");
            }
        }

        self.models.insert(
            envelope.id.clone(),
            RegistryEntry {
                envelope,
                last_accessed: now,
                expires_at,
            },
        );
        Ok(())
    }

    pub fn add_variant_rule(&mut self, rule: VariantRule) {
        self.variant_rules.push(rule);
    }

    pub fn resolve_model(&self, key: &VariantKey) -> Option<String> {
        let mut sorted = self.variant_rules.clone();
        sorted.sort_unstable_by_key(|r| -r.priority);

        for rule in sorted {
            if rule.guards.iter().all(|g| g.matches(key)) {
                if self.models.contains_key(&rule.model_id) {
                    return Some(rule.model_id.clone());
                }
            }
        }
        None
    }
}

static REGISTRY: Lazy<Mutex<ProcessModelRegistry>> = Lazy::new(|| {
    let mut registry = ProcessModelRegistry::new(512);

    let payload =
        include_str!("../vendored-fixtures/models/living_diagnostic_clear_v1.pnml").to_string();
    let envelope = ProcessModelEnvelope {
        id: "living_diagnostic_clear_v1".to_string(),
        name: "Gall Checkpoint Model".to_string(),
        version: "1.0.0".to_string(),
        model_type: ModelType::PNML,
        payload,
        metadata: std::collections::HashMap::new(),
    };
    let _ = registry.insert(envelope, None);

    Mutex::new(registry)
});

pub fn get_registry() -> std::sync::MutexGuard<'static, ProcessModelRegistry> {
    REGISTRY.lock().unwrap()
}

// ─── Verification & Helpers ──────────────────────────────────────────────────

/// Standard SemVer 2.0.0 syntax validator.
pub fn validate_semver(version: &str) -> bool {
    let core = version
        .split('+')
        .next()
        .unwrap_or(version)
        .split('-')
        .next()
        .unwrap_or(version);
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() != 3 {
        return false;
    }
    for part in parts {
        if part.is_empty() {
            return false;
        }
        if part.len() > 1 && part.starts_with('0') {
            return false;
        }
        for c in part.chars() {
            if !c.is_ascii_digit() {
                return false;
            }
        }
    }
    true
}

/// Structural Workflow net validation checker (BFS/DFS).
/// Verifies:
/// 1. Exactly one source place (in-degree = 0).
/// 2. Exactly one sink place (out-degree = 0).
/// 3. All places and transitions exist on a path from source to sink.
pub fn validate_workflow_net(net: &PetriNet) -> Result<(), String> {
    let mut all_nodes = HashSet::new();
    let places: HashSet<&str> = net.places.iter().map(|p| p.id.as_str()).collect();
    let transitions: HashSet<&str> = net.transitions.iter().map(|t| t.id.as_str()).collect();

    all_nodes.extend(places.iter().copied());
    all_nodes.extend(transitions.iter().copied());

    if places.is_empty() {
        return Err("Petri Net has no places".to_string());
    }

    let mut in_degrees = HashMap::new();
    let mut out_degrees = HashMap::new();
    for node in &all_nodes {
        in_degrees.insert(*node, 0);
        out_degrees.insert(*node, 0);
    }

    let mut adj = HashMap::new();
    let mut rev_adj = HashMap::new();
    for node in &all_nodes {
        adj.insert(*node, Vec::new());
        rev_adj.insert(*node, Vec::new());
    }

    for arc in &net.arcs {
        let from = arc.from.as_str();
        let to = arc.to.as_str();

        if !all_nodes.contains(from) || !all_nodes.contains(to) {
            return Err(format!(
                "Arc references non-existent node: from '{}' to '{}'",
                from, to
            ));
        }

        *out_degrees.entry(from).or_default() += 1;
        *in_degrees.entry(to).or_default() += 1;

        adj.get_mut(from).unwrap().push(to);
        rev_adj.get_mut(to).unwrap().push(from);
    }

    let mut source_places = Vec::new();
    let mut sink_places = Vec::new();

    for place in &places {
        if *in_degrees.get(place).unwrap_or(&0) == 0 {
            source_places.push(*place);
        }
        if *out_degrees.get(place).unwrap_or(&0) == 0 {
            sink_places.push(*place);
        }
    }

    if source_places.len() != 1 {
        return Err(format!(
            "Workflow net must have exactly 1 source place, found {}",
            source_places.len()
        ));
    }
    if sink_places.len() != 1 {
        return Err(format!(
            "Workflow net must have exactly 1 sink place, found {}",
            sink_places.len()
        ));
    }

    let source_place = source_places[0];
    let sink_place = sink_places[0];

    // Traverse forward from source place
    let mut visited_forward = HashSet::new();
    let mut q = std::collections::VecDeque::new();
    visited_forward.insert(source_place);
    q.push_back(source_place);

    while let Some(curr) = q.pop_front() {
        if let Some(nbrs) = adj.get(curr) {
            for nbr in nbrs {
                if visited_forward.insert(*nbr) {
                    q.push_back(*nbr);
                }
            }
        }
    }

    // Traverse backward from sink place
    let mut visited_backward = HashSet::new();
    let mut q_rev = std::collections::VecDeque::new();
    visited_backward.insert(sink_place);
    q_rev.push_back(sink_place);

    while let Some(curr) = q_rev.pop_front() {
        if let Some(nbrs) = rev_adj.get(curr) {
            for nbr in nbrs {
                if visited_backward.insert(*nbr) {
                    q_rev.push_back(*nbr);
                }
            }
        }
    }

    // Verify all nodes are connected
    for node in &all_nodes {
        if !visited_forward.contains(node) {
            return Err(format!(
                "Node '{}' is unreachable from source place '{}'",
                node, source_place
            ));
        }
        if !visited_backward.contains(node) {
            return Err(format!(
                "Sink place '{}' is unreachable from node '{}'",
                sink_place, node
            ));
        }
    }

    Ok(())
}

// ─── WASM bindings ────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn register_model(envelope_json: &str) -> Result<String, JsValue> {
    let envelope: ProcessModelEnvelope = serde_json::from_str(envelope_json).map_err(|e| {
        wasm_err(
            codes::INVALID_JSON,
            format!("Failed to parse envelope JSON: {}", e),
        )
    })?;

    if !validate_semver(&envelope.version) {
        return Err(wasm_err(
            codes::INVALID_INPUT,
            format!("Invalid SemVer version: '{}'", envelope.version),
        ));
    }

    match envelope.model_type {
        ModelType::PNML => {
            let petri_net = crate::pnml_io::from_pnml(&envelope.payload).map_err(|e| {
                wasm_err(codes::PARSE_ERROR, format!("Failed to parse PNML: {}", e))
            })?;

            validate_workflow_net(&petri_net).map_err(|e| {
                wasm_err(
                    "INVALID_WORKFLOW_NET",
                    format!("Workflow net structural check failed: {}", e),
                )
            })?;
        }
        ModelType::POWL => {
            #[cfg(feature = "powl")]
            {
                let mut arena = crate::powl_arena::PowlArena::new();
                crate::powl_parser::parse_powl_model_string(&envelope.payload, &mut arena)
                    .map_err(|e| {
                        wasm_err(codes::PARSE_ERROR, format!("Failed to parse POWL: {:?}", e))
                    })?;
            }
            #[cfg(not(feature = "powl"))]
            {
                return Err(wasm_err(codes::NOT_IMPLEMENTED, "POWL feature not enabled"));
            }
        }
    }

    // Optional TTL parsing from envelope metadata
    let ttl = envelope
        .metadata
        .get("ttl_seconds")
        .and_then(|s| s.parse::<u64>().ok())
        .map(Duration::from_secs);

    let id = envelope.id.clone();
    let mut reg = get_registry();
    reg.insert(envelope, ttl)
        .map_err(|e| wasm_err("LIMIT_EXCEEDED", e))?;

    Ok(serde_json::json!({
        "status": "success",
        "model_id": id
    })
    .to_string())
}

#[wasm_bindgen]
pub fn get_model(model_id: &str) -> Result<String, JsValue> {
    let mut reg = get_registry();
    if let Some(envelope) = reg.get(model_id) {
        serde_json::to_string(&envelope).map_err(|e| {
            wasm_err(
                codes::INTERNAL_ERROR,
                format!("Failed to serialize envelope: {}", e),
            )
        })
    } else {
        Err(wasm_err(
            "INVALID_MODEL_HANDLE",
            format!("Model '{}' not found or expired", model_id),
        ))
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PetriNetArc, PetriNetPlace, PetriNetTransition};

    fn create_test_petri_net(
        places: &[&str],
        transitions: &[&str],
        arcs: &[(&str, &str)],
    ) -> PetriNet {
        PetriNet {
            places: places
                .iter()
                .map(|p| PetriNetPlace {
                    id: p.to_string(),
                    label: p.to_string(),
                    marking: None,
                })
                .collect(),
            transitions: transitions
                .iter()
                .map(|t| PetriNetTransition {
                    id: t.to_string(),
                    label: t.to_string(),
                    is_invisible: None,
                })
                .collect(),
            arcs: arcs
                .iter()
                .map(|(f, t)| PetriNetArc {
                    from: f.to_string(),
                    to: t.to_string(),
                    weight: None,
                })
                .collect(),
            initial_marking: HashMap::new(),
            final_markings: Vec::new(),
        }
    }

    #[test]
    fn test_workflow_net_validation() {
        // Valid Petri Net: P1 (source) -> T1 -> P2 (sink)
        let net = create_test_petri_net(&["P1", "P2"], &["T1"], &[("P1", "T1"), ("T1", "P2")]);
        assert!(validate_workflow_net(&net).is_ok());

        // Invalid: No places
        let net = create_test_petri_net(&[], &["T1"], &[]);
        assert!(validate_workflow_net(&net).is_err());

        // Invalid: Multiple source places
        let net =
            create_test_petri_net(&["P1", "P2", "P3"], &["T1"], &[("P1", "T1"), ("T1", "P3")]);
        assert!(validate_workflow_net(&net).is_err());

        // Invalid: Multiple sink places
        let net =
            create_test_petri_net(&["P1", "P2", "P3"], &["T1"], &[("P1", "T1"), ("T1", "P2")]);
        assert!(validate_workflow_net(&net).is_err());

        // Invalid: Unreachable node (T2 is detached)
        let net =
            create_test_petri_net(&["P1", "P2"], &["T1", "T2"], &[("P1", "T1"), ("T1", "P2")]);
        assert!(validate_workflow_net(&net).is_err());
    }

    #[test]
    fn test_lru_eviction() {
        let mut registry = ProcessModelRegistry::new(2);
        let env1 = ProcessModelEnvelope {
            id: "m1".to_string(),
            name: "Model 1".to_string(),
            version: "1.0.0".to_string(),
            model_type: ModelType::PNML,
            payload: "payload1".to_string(),
            metadata: HashMap::new(),
        };
        let env2 = ProcessModelEnvelope {
            id: "m2".to_string(),
            name: "Model 2".to_string(),
            version: "1.0.0".to_string(),
            model_type: ModelType::PNML,
            payload: "payload2".to_string(),
            metadata: HashMap::new(),
        };
        let env3 = ProcessModelEnvelope {
            id: "m3".to_string(),
            name: "Model 3".to_string(),
            version: "1.0.0".to_string(),
            model_type: ModelType::PNML,
            payload: "payload3".to_string(),
            metadata: HashMap::new(),
        };

        assert!(registry.insert(env1.clone(), None).is_ok());
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(registry.insert(env2.clone(), None).is_ok());
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(registry.get("m1").is_some());
        std::thread::sleep(std::time::Duration::from_millis(5));

        // Inserting m3 should evict m2 (since m2 is LRU, m1 was accessed after m2)
        assert!(registry.insert(env3.clone(), None).is_ok());
        assert!(registry.get("m1").is_some());
        assert!(registry.get("m2").is_none());
        assert!(registry.get("m3").is_some());
    }

    #[test]
    fn test_ttl_expiration() {
        let mut registry = ProcessModelRegistry::new(10);
        let env = ProcessModelEnvelope {
            id: "m1".to_string(),
            name: "Model 1".to_string(),
            version: "1.0.0".to_string(),
            model_type: ModelType::PNML,
            payload: "payload1".to_string(),
            metadata: HashMap::new(),
        };

        assert!(registry
            .insert(env, Some(Duration::from_millis(10)))
            .is_ok());
        // Get immediately
        assert!(registry.get("m1").is_some());

        // Sleep to ensure expiration
        std::thread::sleep(Duration::from_millis(30));
        assert!(registry.get("m1").is_none());
    }

    #[test]
    fn test_variant_routing() {
        let mut registry = ProcessModelRegistry::new(10);
        let env1 = ProcessModelEnvelope {
            id: "m1".to_string(),
            name: "Model 1".to_string(),
            version: "1.0.0".to_string(),
            model_type: ModelType::PNML,
            payload: "payload1".to_string(),
            metadata: HashMap::new(),
        };
        let env2 = ProcessModelEnvelope {
            id: "m2".to_string(),
            name: "Model 2".to_string(),
            version: "1.0.0".to_string(),
            model_type: ModelType::PNML,
            payload: "payload2".to_string(),
            metadata: HashMap::new(),
        };

        assert!(registry.insert(env1, None).is_ok());
        assert!(registry.insert(env2, None).is_ok());

        // Define rules
        let rule1 = VariantRule {
            model_id: "m1".to_string(),
            guards: vec![ConditionalGuard {
                attribute_name: "region".to_string(),
                operation: ComparisonOp::Equals,
                threshold: "US".to_string(),
            }],
            priority: 1,
        };
        let rule2 = VariantRule {
            model_id: "m2".to_string(),
            guards: vec![ConditionalGuard {
                attribute_name: "region".to_string(),
                operation: ComparisonOp::Equals,
                threshold: "EU".to_string(),
            }],
            priority: 2,
        };
        let rule3 = VariantRule {
            model_id: "m2".to_string(),
            guards: vec![ConditionalGuard {
                attribute_name: "value".to_string(),
                operation: ComparisonOp::GreaterThan,
                threshold: "100".to_string(),
            }],
            priority: 3,
        };

        registry.add_variant_rule(rule1);
        registry.add_variant_rule(rule2);
        registry.add_variant_rule(rule3);

        // Test matching US
        let mut attributes = HashMap::new();
        attributes.insert("region".to_string(), "US".to_string());
        let key = VariantKey { attributes };
        assert_eq!(registry.resolve_model(&key), Some("m1".to_string()));

        // Test matching EU (which has higher priority)
        let mut attributes = HashMap::new();
        attributes.insert("region".to_string(), "EU".to_string());
        let key = VariantKey { attributes };
        assert_eq!(registry.resolve_model(&key), Some("m2".to_string()));

        // Test priority routing: both US (rule1, priority 1) and value > 100 (rule3, priority 3) match
        let mut attributes = HashMap::new();
        attributes.insert("region".to_string(), "US".to_string());
        attributes.insert("value".to_string(), "150".to_string());
        let key = VariantKey { attributes };
        assert_eq!(registry.resolve_model(&key), Some("m2".to_string()));
    }

    #[test]
    fn test_comparison_ops() {
        let key = |val: &str| {
            let mut attributes = HashMap::new();
            attributes.insert("attr".to_string(), val.to_string());
            VariantKey { attributes }
        };

        let guard = |op: ComparisonOp, thresh: &str| ConditionalGuard {
            attribute_name: "attr".to_string(),
            operation: op,
            threshold: thresh.to_string(),
        };

        // Equals
        assert!(guard(ComparisonOp::Equals, "hello").matches(&key("hello")));
        assert!(!guard(ComparisonOp::Equals, "hello").matches(&key("world")));

        // NotEquals
        assert!(guard(ComparisonOp::NotEquals, "hello").matches(&key("world")));
        assert!(!guard(ComparisonOp::NotEquals, "hello").matches(&key("hello")));

        // Contains
        assert!(guard(ComparisonOp::Contains, "ell").matches(&key("hello")));
        assert!(!guard(ComparisonOp::Contains, "ell").matches(&key("world")));

        // GreaterThan
        // Numeric
        assert!(guard(ComparisonOp::GreaterThan, "10").matches(&key("15")));
        assert!(!guard(ComparisonOp::GreaterThan, "10").matches(&key("5")));
        assert!(!guard(ComparisonOp::GreaterThan, "10").matches(&key("10")));
        // String fallback
        assert!(guard(ComparisonOp::GreaterThan, "apple").matches(&key("banana")));
        assert!(!guard(ComparisonOp::GreaterThan, "banana").matches(&key("apple")));

        // LessThan
        // Numeric
        assert!(guard(ComparisonOp::LessThan, "10").matches(&key("5")));
        assert!(!guard(ComparisonOp::LessThan, "10").matches(&key("15")));
        assert!(!guard(ComparisonOp::LessThan, "10").matches(&key("10")));
        // String fallback
        assert!(guard(ComparisonOp::LessThan, "banana").matches(&key("apple")));
        assert!(!guard(ComparisonOp::LessThan, "apple").matches(&key("banana")));
    }

    #[test]
    fn test_semver_validation() {
        assert!(validate_semver("1.0.0"));
        assert!(validate_semver("0.1.0"));
        assert!(validate_semver("2.3.4-alpha.1"));
        assert!(validate_semver("2.3.4+build.123"));
        assert!(validate_semver("12.34.56"));

        assert!(!validate_semver("1.0"));
        assert!(!validate_semver("1"));
        assert!(!validate_semver("a.b.c"));
        assert!(!validate_semver("01.0.0"));
        assert!(!validate_semver("1.0.01"));
        assert!(!validate_semver(""));
    }

    #[test]
    fn test_living_diagnostic_clear_v1_validation() {
        let pnml = include_str!("../vendored-fixtures/models/living_diagnostic_clear_v1.pnml");
        let petri_net = crate::pnml_io::from_pnml(pnml).unwrap();
        assert!(validate_workflow_net(&petri_net).is_ok());

        let place_index: std::collections::HashMap<&String, usize> = petri_net
            .places
            .iter()
            .enumerate()
            .map(|(i, p)| (&p.id, i))
            .collect();
        let mut place_index_fx = rustc_hash::FxHashMap::default();
        for (k, v) in place_index {
            place_index_fx.insert(k, v);
        }
        let mut marking = vec![0; petri_net.places.len()];
        let p_source_idx = place_index_fx
            .get(&"p_source".to_string())
            .copied()
            .unwrap();
        marking[p_source_idx] = 1;

        let reachable = crate::models::is_final_reachable(&petri_net, &marking, &place_index_fx);
        assert!(
            reachable,
            "Final marking should be reachable from p_source!"
        );

        let mut marking2 = vec![0; petri_net.places.len()];
        let p2_idx = place_index_fx.get(&"p2".to_string()).copied().unwrap();
        marking2[p2_idx] = 1;

        let reachable2 = crate::models::is_final_reachable(&petri_net, &marking2, &place_index_fx);
        assert!(reachable2, "Final marking should be reachable from p2!");
    }
}
