//! POWL WASM bindings — public API exported to JavaScript.

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

use crate::powl_arena::PowlArena;
use crate::powl_parser::parse_powl_model_string;
use crate::powl::simplify::{simplify, simplify_using_frequent_transitions};
use crate::powl::analysis::complexity::measure;
use crate::powl::analysis::diff::diff as model_diff;
use crate::powl::conversion::to_petri_net;
use crate::powl::conversion::to_bpmn;
use crate::powl::conversion::to_process_tree;
use crate::powl::conversion::from_process_tree;
use crate::powl::conversion::from_petri_net;
use crate::powl::conformance::token_replay::compute_fitness;
use crate::powl::conformance::soundness::check_soundness;
use crate::powl::conformance::footprints_conf::check as footprints_conformance_check;
use crate::powl::footprints::apply as footprints_apply;
use crate::powl::discovery::{discover_powl, DiscoveryConfig, DiscoveryVariant};
use crate::powl::visualization::process_tree_svg::render_process_tree_svg;
use crate::models::EventLog as ModelsEventLog;
use crate::powl_event_log::EventLog;
use crate::powl_models::PowlPetriNetResult;

fn to_js(val: &impl serde::Serialize) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(val)
        .map_err(|e| JsValue::from_str(&format!("serde error: {}", e)))
}

fn wasm_err(msg: &str) -> JsValue {
    JsValue::from_str(msg)
}

/// Helper: parse a POWL string into an arena + root, returning a JS error on failure.
fn parse_model(s: &str) -> Result<(PowlArena, u32), JsValue> {
    let mut arena = PowlArena::new();
    let root = parse_powl_model_string(s.trim(), &mut arena)
        .map_err(|e| wasm_err(&format!("parse error: {}", e)))?;
    Ok((arena, root))
}

// ─── Parsing ──────────────────────────────────────────────────────────────

/// Parse a POWL model string.
///
/// # Arguments
/// * `s` - POWL model string, e.g. `"X (A, B)"`, `"PO=(nodes={A, B}, order={A-->B})"`
///
/// # Returns
/// JSON: `{ "root": u32, "node_count": usize, "repr": "..." }`
#[wasm_bindgen]
pub fn parse_powl(s: &str) -> Result<JsValue, JsValue> {
    let (arena, root) = parse_model(s)?;
    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
    }))
}

/// Validate that all StrictPartialOrder nodes have irreflexive, transitive order.
#[wasm_bindgen]
pub fn validate_partial_orders(s: &str) -> Result<JsValue, JsValue> {
    let (arena, root) = parse_model(s)?;
    arena.validate_partial_orders(root).map_err(|e| wasm_err(&e))?;
    to_js(&serde_json::json!({ "valid": true }))
}

// ─── String representation ────────────────────────────────────────────────

/// Convert a POWL model string to its canonical string representation.
#[wasm_bindgen]
pub fn powl_to_string(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    Ok(arena.to_repr(root))
}

// ─── Simplification ───────────────────────────────────────────────────────

/// Simplify a POWL model (XOR/LOOP merging, nested XOR flattening, SPO inlining).
#[wasm_bindgen]
pub fn simplify_powl(s: &str) -> Result<JsValue, JsValue> {
    let (mut arena, root) = parse_model(s)?;
    let new_root = simplify(&mut arena, root);
    let repr = arena.to_repr(new_root);
    to_js(&serde_json::json!({
        "root": new_root,
        "node_count": arena.len(),
        "repr": repr,
    }))
}

/// Simplify a POWL model using FrequentTransition frequency bounds.
#[wasm_bindgen]
pub fn simplify_frequent_transitions(s: &str) -> Result<JsValue, JsValue> {
    let (mut arena, root) = parse_model(s)?;
    let new_root = simplify_using_frequent_transitions(&mut arena, root);
    let repr = arena.to_repr(new_root);
    to_js(&serde_json::json!({
        "root": new_root,
        "node_count": arena.len(),
        "repr": repr,
    }))
}

// ─── Introspection ────────────────────────────────────────────────────────

/// Get the string representation of a specific node in the arena.
#[wasm_bindgen]
pub fn node_to_string(s: &str, arena_idx: u32) -> Result<String, JsValue> {
    let (arena, _root) = parse_model(s)?;
    Ok(arena.to_repr(arena_idx))
}

/// Get the children arena indices of a node.
#[wasm_bindgen]
pub fn get_children(s: &str, arena_idx: u32) -> Result<JsValue, JsValue> {
    let (arena, _root) = parse_model(s)?;
    let children = match arena.get(arena_idx) {
        Some(crate::powl_arena::PowlNode::OperatorPowl(op)) => op.children.clone(),
        Some(crate::powl_arena::PowlNode::StrictPartialOrder(spo)) => spo.children.clone(),
        Some(crate::powl_arena::PowlNode::DecisionGraph(dg)) => dg.children.clone(),
        _ => vec![],
    };
    to_js(&serde_json::json!({ "children": children }))
}

/// Get detailed JSON info about a node.
#[wasm_bindgen]
pub fn node_info_json(s: &str, arena_idx: u32) -> Result<String, JsValue> {
    let (arena, _root) = parse_model(s)?;
    let info = match arena.get(arena_idx) {
        Some(crate::powl_arena::PowlNode::Transition(t)) => serde_json::json!({
            "type": "transition",
            "label": t.label,
            "id": t.id,
        }),
        Some(crate::powl_arena::PowlNode::FrequentTransition(t)) => serde_json::json!({
            "type": "frequent_transition",
            "label": t.label,
            "activity": t.activity,
            "skippable": t.skippable,
            "selfloop": t.selfloop,
            "id": t.id,
        }),
        Some(crate::powl_arena::PowlNode::StrictPartialOrder(spo)) => {
            let edges: Vec<Vec<usize>> = spo.order.edge_list()
                .into_iter()
                .map(|(a, b)| vec![a, b])
                .collect();
            serde_json::json!({
                "type": "strict_partial_order",
                "children": spo.children,
                "edges": edges,
                "node_count": spo.order.n,
            })
        }
        Some(crate::powl_arena::PowlNode::OperatorPowl(op)) => serde_json::json!({
            "type": "operator",
            "operator": op.operator.as_str(),
            "children": op.children,
        }),
        Some(crate::powl_arena::PowlNode::DecisionGraph(dg)) => {
            let edges: Vec<Vec<usize>> = dg.order.edge_list()
                .into_iter()
                .map(|(a, b)| vec![a, b])
                .collect();
            serde_json::json!({
                "type": "decision_graph",
                "children": dg.children,
                "edges": edges,
                "start_nodes": dg.start_nodes,
                "end_nodes": dg.end_nodes,
                "empty_path": dg.empty_path,
                "node_count": dg.order.n,
            })
        }
        None => serde_json::json!({ "error": "invalid index" }),
    };
    Ok(serde_json::to_string(&info).unwrap_or_default())
}

// ─── Conversions ──────────────────────────────────────────────────────────

/// Convert a POWL model to a Petri Net (JSON).
#[wasm_bindgen]
pub fn powl_to_petri_net(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    let result: PowlPetriNetResult = to_petri_net::apply(&arena, root);
    serde_json::to_string_pretty(&result)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

/// Convert a POWL model to a Process Tree (JSON).
#[wasm_bindgen]
pub fn powl_to_process_tree(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    let tree = to_process_tree::apply(&arena, root);
    serde_json::to_string_pretty(&tree)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

/// Convert a Process Tree (JSON) to a POWL model.
///
/// Input JSON format (same as `powl_to_process_tree` output):
/// ```json
/// {"operator": "Xor", "children": [{"label": "A"}, {"label": "B"}]}
/// ```
///
/// Returns: `{ "root": u32, "node_count": usize, "repr": "..." }`
#[wasm_bindgen]
pub fn process_tree_to_powl(tree_json: &str) -> Result<JsValue, JsValue> {
    let (arena, root) = from_process_tree::process_tree_to_powl(tree_json)
        .map_err(|e| wasm_err(&e))?;
    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
    }))
}

/// Convert a Petri Net (JSON) to a POWL model.
///
/// Input JSON format (same as `powl_to_petri_net` output):
/// ```json
/// { "net": { "places": [...], "transitions": [...], "arcs": [...] }, "initial_marking": {...}, "final_marking": {...} }
/// ```
///
/// Returns: `{ "root": u32, "node_count": usize, "repr": "..." }`
#[wasm_bindgen]
pub fn petri_net_to_powl(pn_json: &str) -> Result<JsValue, JsValue> {
    let (arena, root) = from_petri_net::petri_net_to_powl(pn_json)
        .map_err(|e| wasm_err(&e))?;
    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
    }))
}

/// Convert a POWL model to BPMN 2.0 XML.
#[wasm_bindgen]
pub fn powl_to_bpmn(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    let xml = to_bpmn::to_bpmn_xml(&arena, root);
    Ok(xml)
}

// ─── Conformance ──────────────────────────────────────────────────────────

/// Compute token replay fitness for a POWL model against an event log.
///
/// # Arguments
/// * `powl_str` - POWL model string
/// * `log_json` - JSON event log: `{ "traces": [{ "case_id": "...", "events": [{ "name": "A" }] }] }`
///
/// # Returns
/// JSON fitness result.
#[wasm_bindgen]
pub fn token_replay_fitness(powl_str: &str, log_json: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(powl_str)?;
    let pn_result: PowlPetriNetResult = to_petri_net::apply(&arena, root);

    let log: EventLog = serde_json::from_str(log_json)
        .map_err(|e| wasm_err(&format!("log parse error: {}", e)))?;

    let fitness_result = compute_fitness(
        &pn_result.net,
        &pn_result.initial_marking,
        &pn_result.final_marking,
        &log,
    );

    serde_json::to_string_pretty(&fitness_result)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

/// Check soundness of a POWL model (van der Aalst criteria).
///
/// Returns: `{ "sound": bool, "deadlock_free": bool, "bounded": bool, "liveness": bool }`
#[wasm_bindgen]
pub fn check_powl_soundness(powl_str: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(powl_str)?;
    let pn_result: PowlPetriNetResult = to_petri_net::apply(&arena, root);

    let soundness_result = check_soundness(
        &pn_result.net,
        &pn_result.initial_marking,
        &pn_result.final_marking,
    );

    serde_json::to_string_pretty(&soundness_result)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

/// Compute footprints-based conformance (fitness, precision, recall, F1).
///
/// # Arguments
/// * `powl_str` - POWL model string
/// * `log_json` - JSON event log: `{ "traces": [{ "case_id": "...", "events": [{ "name": "A" }] }] }`
///
/// # Returns
/// JSON: `{ "fitness": f64, "precision": f64, "recall": f64, "f1": f64 }`
#[wasm_bindgen]
pub fn footprints_conformance(powl_str: &str, log_json: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(powl_str)?;
    let model_fp = footprints_apply(&arena, root);

    let log: EventLog = serde_json::from_str(log_json)
        .map_err(|e| wasm_err(&format!("log parse error: {}", e)))?;

    let result = footprints_conformance_check(&log, &model_fp);

    serde_json::to_string_pretty(&result)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

// ─── Analysis ─────────────────────────────────────────────────────────────

/// Measure complexity metrics for a POWL model.
///
/// Returns: `{ "cyclomatic": u32, "cfc": f64, "cognitive": f64, "halstead": { ... } }`
#[wasm_bindgen]
pub fn measure_complexity(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    let report = measure(&arena, root);
    serde_json::to_string_pretty(&report)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

/// Diff two POWL models (structural + behavioral comparison).
///
/// Returns: `{ "severity": "...", "always_changes": [...], "order_changes": [...], "structure_changes": [...] }`
#[wasm_bindgen]
pub fn diff_models(model_a_str: &str, model_b_str: &str) -> Result<String, JsValue> {
    let (arena_a, root_a) = parse_model(model_a_str)?;
    let (arena_b, root_b) = parse_model(model_b_str)?;

    let result = model_diff(&arena_a, root_a, &arena_b, root_b);
    serde_json::to_string_pretty(&result)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

// ─── Footprints ───────────────────────────────────────────────────────────

/// Compute footprints (behavioral profiles) for a POWL model.
///
/// Returns: `{ "start_activities": [...], "end_activities": [...], "parallel": [...], "sequence": [...] }`
#[wasm_bindgen]
pub fn powl_footprints(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    let fp = crate::powl::footprints::apply(&arena, root);
    serde_json::to_string_pretty(&fp)
        .map_err(|e| wasm_err(&format!("json error: {}", e)))
}

// ─── Discovery ─────────────────────────────────────────────────────────────

/// Discover a POWL model from an event log.
///
/// # Arguments
/// * `log_json` - Event log as JSON string (same format as pm4py)
/// * `variant` - Discovery variant: "decision_graph_cyclic" (default), "decision_graph_cyclic_strict",
///               "decision_graph_max", "decision_graph_clustering", "dynamic_clustering",
///               "maximal", or "tree"
///
/// # Returns
/// JSON object with `{ "root": u32, "node_count": usize, "repr": string }`
#[wasm_bindgen]
pub fn discover_powl_from_log(log_json: &str, variant: &str) -> Result<JsValue, JsValue> {
    let log: ModelsEventLog = serde_json::from_str(log_json)
        .map_err(|e| wasm_err(&format!("log parse error: {}", e)))?;

    let discovery_variant = DiscoveryVariant::from_str(variant)
        .unwrap_or(DiscoveryVariant::DecisionGraphCyclic);

    let config = DiscoveryConfig {
        activity_key: "concept:name".to_string(),
        variant: discovery_variant,
        min_trace_count: 1,
        noise_threshold: 0.0,
        from_dfg: false,
    };

    let (arena, root) = discover_powl(&log, &config)
        .map_err(|e| wasm_err(&format!("discovery error: {}", e)))?;

    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
        "variant": variant,
    }))
}

/// Discover a POWL model from an event log with custom configuration.
///
/// # Arguments
/// * `log_json` - Event log as JSON string
/// * `activity_key` - Key to use for activity extraction (default: "concept:name")
/// * `variant` - Discovery variant
/// * `min_trace_count` - Minimum number of traces for a cut (default: 1)
/// * `noise_threshold` - Noise threshold for fall-through (default: 0.0)
///
/// # Returns
/// JSON object with `{ "root": u32, "node_count": usize, "repr": string }`
#[wasm_bindgen]
pub fn discover_powl_from_log_config(
    log_json: &str,
    activity_key: &str,
    variant: &str,
    min_trace_count: usize,
    noise_threshold: f64,
) -> Result<JsValue, JsValue> {
    let log: ModelsEventLog = serde_json::from_str(log_json)
        .map_err(|e| wasm_err(&format!("log parse error: {}", e)))?;

    let discovery_variant = DiscoveryVariant::from_str(variant)
        .unwrap_or(DiscoveryVariant::DecisionGraphCyclic);

    let config = DiscoveryConfig {
        activity_key: activity_key.to_string(),
        variant: discovery_variant,
        min_trace_count,
        noise_threshold,
        from_dfg: false,
    };

    let (arena, root) = discover_powl(&log, &config)
        .map_err(|e| wasm_err(&format!("discovery error: {}", e)))?;

    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
        "variant": variant,
        "config": {
            "activity_key": activity_key,
            "min_trace_count": min_trace_count,
            "noise_threshold": noise_threshold,
        }
    }))
}

/// Discover POWL model from partially ordered event log (lifecycle events)
///
/// # Arguments
/// * `log_json` - Event log as JSON string with lifecycle:transition attribute
/// * `variant` - Discovery variant (same as discover_powl_from_log)
///
/// # Returns
/// JSON object with `{ "root": u32, "node_count": usize, "repr": string, "partial_order": true }`
#[wasm_bindgen]
pub fn discover_powl_from_partial_orders(
    log_json: &str,
    variant: &str,
) -> Result<JsValue, JsValue> {
    let log: ModelsEventLog = serde_json::from_str(log_json)
        .map_err(|e| wasm_err(&format!("log parse error: {}", e)))?;

    let discovery_variant = DiscoveryVariant::from_str(variant)
        .unwrap_or(DiscoveryVariant::DecisionGraphCyclic);

    let config = DiscoveryConfig {
        activity_key: "concept:name".to_string(),
        variant: discovery_variant,
        min_trace_count: 1,
        noise_threshold: 0.0,
        from_dfg: false,
    };

    let mut arena = PowlArena::new();
    let root = crate::powl::discovery::from_partial_orders::discover_from_partial_orders(
        &log,
        &config,
        &mut arena,
    )
    .map_err(|e| wasm_err(&format!("partial order discovery error: {}", e)))?;

    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
        "variant": variant,
        "partial_order": true,
    }))
}

/// Discover POWL model from OCEL event log
///
/// # Arguments
/// * `ocel_json` - OCEL event log as JSON string
/// * `variant` - OCEL variant: "flattening" or "oc_powl"
///
/// # Returns
/// JSON object with `{ "root": u32, "node_count": usize, "repr": string, "ocel_variant": string }`
#[wasm_bindgen]
pub fn discover_ocel_powl(
    ocel_json: &str,
    variant: &str,
) -> Result<JsValue, JsValue> {
    let log: ModelsEventLog = serde_json::from_str(ocel_json)
        .map_err(|e| wasm_err(&format!("ocel log parse error: {}", e)))?;

    let ocel_variant = crate::powl::discovery::ocel::OcelVariant::from_str(variant)
        .ok_or_else(|| wasm_err("invalid OCEL variant: use 'flattening' or 'oc_powl'"))?;

    let config = DiscoveryConfig {
        activity_key: "concept:name".to_string(),
        variant: DiscoveryVariant::DecisionGraphCyclic,
        min_trace_count: 1,
        noise_threshold: 0.0,
        from_dfg: false,
    };

    let mut arena = PowlArena::new();
    let root = crate::powl::discovery::ocel::discover_ocel_powl(&log, &config, &mut arena, ocel_variant)
        .map_err(|e| wasm_err(&format!("ocel discovery error: {}", e)))?;

    let repr = arena.to_repr(root);
    to_js(&serde_json::json!({
        "root": root,
        "node_count": arena.len(),
        "repr": repr,
        "ocel_variant": variant,
    }))
}

/// Render a POWL model as SVG.
///
/// # Arguments
/// * `s` - POWL model string, e.g. `"X(A, B)"`, `"PO=(nodes={A, B}, order={A-->B})"`
///
/// # Returns
/// SVG string with colored operator nodes and activity labels
#[wasm_bindgen]
pub fn powl_to_svg(s: &str) -> Result<String, JsValue> {
    let (arena, root) = parse_model(s)?;
    let svg = render_process_tree_svg(&arena, root);
    Ok(svg)
}

// ─── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_event_log::Trace;

    /// Test-only parse helper that avoids JsValue::from_str (panics outside WASM).
    fn parse_test(s: &str) -> Result<(PowlArena, u32), String> {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s.trim(), &mut arena)?;
        Ok((arena, root))
    }

    // ─── Paper-aligned: bicycle manufacturing (Kourani et al., Listing 1.2) ───

    /// POWL model for the bicycle manufacturing process from the paper.
    /// Exercises: partial orders, XOR choice, sequential flow, ordering constraints.
    fn bicycle_powl() -> &'static str {
        // Flat PO with XOR choice and sequential assembly:
        // create → XOR(accept | reject) → prepare → assemble → ship → finish
        "PO=(nodes={create_process, X(accept_order, reject_order), \
            prepare_assembly, assemble_bicycle, ship_bicycle, finish_process}, \
            order={create_process-->X(accept_order, reject_order), \
            X(accept_order, reject_order)-->prepare_assembly, \
            prepare_assembly-->assemble_bicycle, \
            assemble_bicycle-->ship_bicycle, \
            ship_bicycle-->finish_process})"
    }

    #[test]
    fn paper_bicycle_parse_and_validate() {
        let (arena, root) = parse_test(bicycle_powl()).unwrap();
        assert!(arena.validate_partial_orders(root).is_ok());
        assert_eq!(arena.to_repr(root).contains("create_process"), true);
    }

    #[test]
    fn paper_bicycle_to_petri_net() {
        let (arena, root) = parse_test(bicycle_powl()).unwrap();
        let result: PowlPetriNetResult = to_petri_net::apply(&arena, root);
        assert!(result.net.places.len() > 3);
        assert!(result.net.transitions.len() > 3);
        let labels: Vec<&str> = result.net.transitions.iter()
            .filter_map(|t| t.label.as_deref())
            .collect();
        assert!(labels.contains(&"create_process"));
        assert!(labels.contains(&"accept_order"));
        assert!(labels.contains(&"reject_order"));
        assert!(labels.contains(&"assemble_bicycle"));
        assert!(labels.contains(&"ship_bicycle"));
    }

    #[test]
    fn paper_bicycle_to_bpmn() {
        let (arena, root) = parse_test(bicycle_powl()).unwrap();
        let xml = to_bpmn::to_bpmn_xml(&arena, root);
        assert!(xml.contains("<definitions"));
        assert!(xml.contains("exclusiveGateway") || xml.contains("parallelGateway"));
        assert!(xml.contains("</definitions>"));
    }

    #[test]
    fn paper_bicycle_complexity() {
        let (arena, root) = parse_test(bicycle_powl()).unwrap();
        let report = measure(&arena, root);
        // Model with XOR choice should have cyclomatic >= 2
        assert!(report.cyclomatic >= 2);
        assert!(report.cfc >= 1);
        assert!(report.halstead.volume > 0.0);
        assert!(report.activity_count >= 5);
    }

    #[test]
    fn paper_bicycle_footprints() {
        let (arena, root) = parse_test(bicycle_powl()).unwrap();
        let fp = crate::powl::footprints::apply(&arena, root);
        assert!(fp.start_activities.contains("create_process"));
        assert!(fp.end_activities.contains("finish_process"));
        assert!(!fp.parallel.is_empty() || !fp.sequence.is_empty());
    }

    // ─── Paper-aligned: online shop process (Table 1) ───

    /// Online shop process: login → concurrent items/payment → reward → XOR(pay,installment) → delivery → LOOP(return).
    fn online_shop_powl() -> &'static str {
        "PO=(nodes={login, PO=(nodes={select_items, set_payment_method}, order={}), \
            reward_selection, \
            X(pay, installment), \
            delivery, \
            *(return_exchange, return_choice)}, \
            order={login-->PO=(nodes={select_items, set_payment_method}, order={}), \
            PO=(nodes={select_items, set_payment_method}, order={})-->reward_selection, \
            reward_selection-->X(pay,installment), \
            X(pay,installment)-->delivery, \
            delivery-->*(return_exchange, return_choice)})"
    }

    #[test]
    fn paper_online_shop_parse_and_validate() {
        let (arena, root) = parse_test(online_shop_powl()).unwrap();
        assert!(arena.validate_partial_orders(root).is_ok());
    }

    #[test]
    fn paper_online_shop_to_petri_net() {
        let (arena, root) = parse_test(online_shop_powl()).unwrap();
        let result: PowlPetriNetResult = to_petri_net::apply(&arena, root);
        let labels: Vec<&str> = result.net.transitions.iter()
            .filter_map(|t| t.label.as_deref())
            .collect();
        assert!(labels.contains(&"select_items"));
        assert!(labels.contains(&"pay"));
        assert!(labels.contains(&"delivery"));
        assert!(labels.contains(&"return_exchange"));
    }

    #[test]
    fn paper_online_shop_conformance_perfect() {
        let (arena, root) = parse_test(online_shop_powl()).unwrap();
        let pn_result: PowlPetriNetResult = to_petri_net::apply(&arena, root);

        let log = EventLog {
            traces: vec![Trace {
                case_id: "c1".to_string(),
                events: vec![
                    crate::powl_event_log::Event { name: "login".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "select_items".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "set_payment_method".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "reward_selection".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "pay".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "delivery".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                ],
            }],
        };
        let fitness = compute_fitness(&pn_result.net, &pn_result.initial_marking, &pn_result.final_marking, &log);
        assert!(fitness.percentage > 0.0);
    }

    // ─── Paper-aligned: hotel service process (Table 2) ───

    /// Hotel service: take order → concurrent(kitchen, sommelier) → assign waiter →
    /// concurrent(ready_cart, kitchen+wine) → deliver → debit. Optional tip loop.
    fn hotel_powl() -> &'static str {
        "PO=(nodes={take_order, PO=(nodes={submit_kitchen, fetch_wine}, order={}), \
            assign_waiter, \
            PO=(nodes={ready_cart, deliver}, order={}), \
            *(deliver, tip_optional), \
            debit_account}, \
            order={take_order-->PO=(nodes={submit_kitchen, fetch_wine}, order={}), \
            PO=(nodes={submit_kitchen, fetch_wine}, order={})-->assign_waiter, \
            assign_waiter-->PO=(nodes={ready_cart, deliver}, order={}), \
            PO=(nodes={ready_cart, deliver}, order={})-->deliver, \
            deliver-->*(deliver, tip_optional), \
            deliver-->debit_account})"
    }

    #[test]
    fn paper_hotel_parse_and_validate() {
        let (arena, root) = parse_test(hotel_powl()).unwrap();
        assert!(arena.validate_partial_orders(root).is_ok());
    }

    #[test]
    fn paper_hotel_sound_bpmn_export() {
        let (arena, root) = parse_test(hotel_powl()).unwrap();
        let xml = to_bpmn::to_bpmn_xml(&arena, root);
        // BPMN export should be valid XML
        assert!(xml.contains("<definitions"));
        assert!(xml.contains("</definitions>"));
        // Should have gateways for concurrent activities
        assert!(xml.contains("Gateway"));
    }

    #[test]
    fn paper_hotel_conformance() {
        let (arena, root) = parse_test(hotel_powl()).unwrap();
        let pn_result: PowlPetriNetResult = to_petri_net::apply(&arena, root);

        let log = EventLog {
            traces: vec![Trace {
                case_id: "h1".to_string(),
                events: vec![
                    crate::powl_event_log::Event { name: "take_order".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "submit_kitchen".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "fetch_wine".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "assign_waiter".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "deliver".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    crate::powl_event_log::Event { name: "debit_account".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                ],
            }],
        };
        let fitness = compute_fitness(&pn_result.net, &pn_result.initial_marking, &pn_result.final_marking, &log);
        assert!(fitness.percentage > 0.0);
        assert!(fitness.total_traces == 1);
    }

    // ─── Paper-aligned: diff between model versions ───

    #[test]
    fn paper_diff_after_feedback() {
        let before = "X ( A, B )";
        let after = "X ( A, B, C )";
        let (arena_a, root_a) = parse_test(before).unwrap();
        let (arena_b, root_b) = parse_test(after).unwrap();
        let d = model_diff(&arena_a, root_a, &arena_b, root_b);
        assert!(d.added_activities.contains(&"C".to_string()));
        assert!(d.severity == crate::powl::analysis::diff::Severity::Moderate);
    }

    // ─── Paper-aligned: simplification flattens nested XOR ───

    #[test]
    fn paper_simplification_flattens_nested_xor() {
        let model_str = "X ( X ( A, B ), C )";
        let (mut arena, root) = parse_test(model_str).unwrap();
        let new_root = simplify(&mut arena, root);
        // Nested XOR should be flattened to X(A, B, C)
        let repr = arena.to_repr(new_root);
        assert_eq!(repr, "X ( A, B, C )");
    }

    // ─── End-to-end: parse → convert → conformance pipeline ───

    #[test]
    fn end_to_end_pipeline() {
        // 1. Parse
        let model_str = "PO=(nodes={A, B, C}, order={A-->B, A-->C})";
        let (arena, root) = parse_test(model_str).unwrap();

        // 2. Validate soundness
        assert!(arena.validate_partial_orders(root).is_ok());

        // 3. Convert to Petri net
        let pn: PowlPetriNetResult = to_petri_net::apply(&arena, root);
        assert!(pn.net.places.len() >= 2);

        // 4. Convert to BPMN
        let bpmn = to_bpmn::to_bpmn_xml(&arena, root);
        assert!(bpmn.contains("<definitions"));

        // 5. Convert to process tree
        let tree = to_process_tree::apply(&arena, root);
        assert!(tree.to_repr().contains("+")); // concurrent → parallel

        // 6. Compute complexity
        let complexity = measure(&arena, root);
        assert_eq!(complexity.activity_count, 3);

        // 7. Compute footprints
        let fp = crate::powl::footprints::apply(&arena, root);
        assert!(fp.start_activities.contains("A"));

        // 8. Token replay conformance
        let log = EventLog {
            traces: vec![
                Trace {
                    case_id: "c1".into(),
                    events: vec![
                        crate::powl_event_log::Event { name: "A".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                        crate::powl_event_log::Event { name: "B".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                        crate::powl_event_log::Event { name: "C".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    ],
                },
                Trace {
                    case_id: "c2".into(),
                    events: vec![
                        crate::powl_event_log::Event { name: "A".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                        crate::powl_event_log::Event { name: "C".into(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new() },
                    ],
                },
            ],
        };
        let fitness = compute_fitness(&pn.net, &pn.initial_marking, &pn.final_marking, &log);
        assert_eq!(fitness.total_traces, 2);
        assert!(fitness.percentage > 0.0);
        assert!(fitness.avg_trace_fitness > 0.0);
    }
}
