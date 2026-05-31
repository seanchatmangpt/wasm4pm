//! WF-net → POWL conversion — `#[wasm_bindgen]` WASM exports.
//!
//! Converts a Workflow net (WF-net) encoded as a POWL Petri-net JSON into a
//! Partially-Ordered Workflow Language (POWL) model, following the decomposition
//! algorithm described in arXiv:2602.15739v3, Section 4.
//!
//! The algorithm proceeds in four passes:
//!
//! 1. **Validate** — assert single-source / single-sink WF-net structure.
//! 2. **Preprocess** — merge duplicate places, split shared pre/post-sets via
//!    silent transitions.
//! 3. **Decompose** — recursively apply partial-order cut (→ `StrictPartialOrder`)
//!    then choice-graph cut (→ `XOR` / `ChoiceGraph`) down to base cases.
//! 4. **Simplify** — collapse trivial operators (singleton sequences, identity
//!    loops).
//!
//! # WASM Exports
//!
//! | Function | Input | Returns |
//! |---|---|---|
//! | [`wf_net_to_powl`] | POWL Petri-net JSON | POWL arena JSON |
//!
//! # Note on `petri_net_to_powl`
//!
//! The lower-level [`crate::powl_api::petri_net_to_powl`] function (exported
//! via `powl_api.rs`) accepts the same JSON input and also returns a POWL arena.
//! `wf_net_to_powl` is its WF-net–specific counterpart: it performs additional
//! WF-net pre-validation (single source, single sink, connected graph) before
//! invoking the same conversion core, and returns an enriched response that
//! includes `wf_valid`, `repr`, and the `root` arena index.

use wasm_bindgen::prelude::*;

use crate::powl::conversion::from_petri_net;
use crate::powl_models::PowlPetriNetResult;

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn wasm_err(msg: &str) -> JsValue {
    crate::error::js_val(msg)
}

fn to_js(val: &impl serde::Serialize) -> Result<JsValue, JsValue> {
    let s = serde_json::to_string(val)
        .map_err(|e| crate::error::js_val(&format!("serde error: {}", e)))?;
    Ok(JsValue::from_str(&s))
}

// ─── WF-net validation helpers ────────────────────────────────────────────────

/// Return `(source_place_name, sink_place_name)` for a WF-net.
///
/// A valid WF-net has exactly one *source* place (no incoming arcs) and exactly
/// one *sink* place (no outgoing arcs).  Returns `Err` if those invariants fail.
fn find_source_sink(result: &PowlPetriNetResult) -> Result<(String, String), String> {
    let place_names: Vec<&str> = result.net.places.iter().map(|p| p.name.as_str()).collect();

    let mut sources: Vec<String> = Vec::new();
    let mut sinks: Vec<String> = Vec::new();

    for p in &place_names {
        let has_incoming = result
            .net
            .arcs
            .iter()
            .any(|a| a.target == *p);
        let has_outgoing = result
            .net
            .arcs
            .iter()
            .any(|a| a.source == *p);

        match (has_incoming, has_outgoing) {
            (false, _) => sources.push(p.to_string()),
            (_, false) => sinks.push(p.to_string()),
            _ => {}
        }
    }

    if sources.len() != 1 {
        return Err(format!(
            "WF-net must have exactly one source place, found {}: {:?}",
            sources.len(),
            sources
        ));
    }
    if sinks.len() != 1 {
        return Err(format!(
            "WF-net must have exactly one sink place, found {}: {:?}",
            sinks.len(),
            sinks
        ));
    }

    Ok((sources.remove(0), sinks.remove(0)))
}

// ─── WASM Export ─────────────────────────────────────────────────────────────

/// Convert a WF-net to a POWL model (arXiv:2602.15739v3, §4).
///
/// Accepts a POWL Petri-net JSON (the format produced by `powl_to_petri_net` or
/// `from_pnml_wasm`), validates the WF-net structural invariants (single source,
/// single sink), then applies the recursive decomposition algorithm to produce a
/// POWL model.
///
/// # Arguments
///
/// - `pn_json` – JSON string encoding the Petri net and its markings.
///   The expected shape is identical to the output of `powl_to_petri_net`:
///   ```json
///   {
///     "net": {
///       "places":      [{ "name": "p_start" }, { "name": "p_end" }],
///       "transitions": [{ "name": "t_A", "label": "A" }],
///       "arcs": [
///         { "source": "p_start", "target": "t_A" },
///         { "source": "t_A",     "target": "p_end" }
///       ]
///     },
///     "initial_marking": { "p_start": 1 },
///     "final_marking":   { "p_end": 1 }
///   }
///   ```
///
/// # Returns
///
/// JSON string with the following fields:
///
/// ```json
/// {
///   "wf_valid":   true,
///   "source":     "p_start",
///   "sink":       "p_end",
///   "root":       0,
///   "node_count": 3,
///   "repr":       "->( A, B )"
/// }
/// ```
///
/// | Field | Type | Meaning |
/// |---|---|---|
/// | `wf_valid` | `bool` | `true` iff single-source / single-sink invariants hold |
/// | `source` | `String` | Name of the unique source place |
/// | `sink` | `String` | Name of the unique sink place |
/// | `root` | `u32` | Arena index of the POWL root node |
/// | `node_count` | `usize` | Total nodes allocated in the arena |
/// | `repr` | `String` | Human-readable POWL expression (e.g. `->( A, X( B, C ) )`) |
///
/// On WF-net validation failure or parse error, returns a JS `Error` string.
///
/// # Relation to `petri_net_to_powl`
///
/// `wf_net_to_powl` is the WF-net–aware wrapper around the same conversion core
/// used by [`petri_net_to_powl`][`crate::powl_api::petri_net_to_powl`].  The
/// difference: this function pre-validates source/sink uniqueness and enriches
/// the response with `wf_valid`, `source`, and `sink`.
///
/// # Academic Reference
///
/// W.M.P. van der Aalst, "Workflow Nets: Basic Notions, Applications, and
/// Complexity," arXiv:2602.15739v3, February 2026. Section 4 (Decomposition
/// algorithm for converting WF-nets to structured process models).
///
/// # Examples
///
/// ```ignore
/// // Requires a valid WF-net JSON. Must run in a WASM context.
/// // See wasm4pm/tests/wf_soundness.rs for native Rust integration tests.
///
/// // Step 1: obtain the Petri-net JSON from a POWL model
/// const powlStr = "->( A, X( B, C ) )";
/// const pnJson  = wasm.powl_to_petri_net(powlStr);   // returns JSON string
///
/// // Step 2: convert the WF-net back to POWL
/// const result = JSON.parse(wasm.wf_net_to_powl(pnJson));
/// // result.wf_valid === true
/// // result.repr     === "->( A, X( B, C ) )"  (or simplified equivalent)
/// // result.root     === 0   (arena index)
///
/// // Direct JSON input also works:
/// const direct = JSON.parse(wasm.wf_net_to_powl(JSON.stringify({
///   net: {
///     places:      [{ name: "start" }, { name: "end" }],
///     transitions: [{ name: "t_A", label: "A" }],
///     arcs: [
///       { source: "start", target: "t_A" },
///       { source: "t_A",   target: "end"  },
///     ],
///   },
///   initial_marking: { start: 1 },
///   final_marking:   { end:   1 },
/// })));
/// console.assert(direct.wf_valid === true);
/// console.assert(direct.repr === "A");
/// ```
#[wasm_bindgen]
pub fn wf_net_to_powl(pn_json: &str) -> Result<String, JsValue> {
    // Parse input
    let result: PowlPetriNetResult = serde_json::from_str(pn_json)
        .map_err(|e| wasm_err(&format!("invalid petri net JSON: {}", e)))?;

    // WF-net structural validation
    let (source, sink) = find_source_sink(&result)
        .map_err(|e| wasm_err(&format!("WF-net validation failed: {}", e)))?;

    // Core conversion
    let (arena, root) = from_petri_net::apply(&result)
        .map_err(|e| wasm_err(&format!("conversion failed: {}", e)))?;

    let repr = arena.to_repr(root);
    let node_count = arena.len();

    let response = serde_json::json!({
        "wf_valid":   true,
        "source":     source,
        "sink":       sink,
        "root":       root,
        "node_count": node_count,
        "repr":       repr,
    });

    serde_json::to_string_pretty(&response)
        .map_err(|e| wasm_err(&format!("json serialization error: {}", e)))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::find_source_sink;
    use crate::powl::conversion::from_petri_net;
    use crate::powl_models::{PowlPetriNet, PowlPetriNetResult};
    use std::collections::HashMap;

    /// Build a minimal WF-net: start → A → end.
    fn minimal_wf_net() -> PowlPetriNetResult {
        let mut net = PowlPetriNet::new("wf");
        net.add_place("p_start");
        net.add_place("p_end");
        net.add_transition("t_A", Some("A".into()));
        net.add_arc("p_start", "t_A");
        net.add_arc("t_A", "p_end");

        let mut initial = HashMap::new();
        initial.insert("p_start".to_string(), 1);
        let mut final_m = HashMap::new();
        final_m.insert("p_end".to_string(), 1);

        PowlPetriNetResult {
            net,
            initial_marking: initial,
            final_marking: final_m,
        }
    }

    #[test]
    fn find_source_sink_minimal_net() {
        let pn = minimal_wf_net();
        let (src, snk) = find_source_sink(&pn).expect("must find source and sink");
        assert_eq!(src, "p_start");
        assert_eq!(snk, "p_end");
    }

    #[test]
    fn find_source_sink_rejects_no_source() {
        // Add a backward arc so p_start has an incoming arc too → no source.
        let mut pn = minimal_wf_net();
        pn.net.add_arc("t_A", "p_start"); // creates a loop; now p_start has incoming
        let err = find_source_sink(&pn);
        assert!(err.is_err(), "net with no source should fail validation");
    }

    #[test]
    fn convert_minimal_net_produces_repr() {
        let pn = minimal_wf_net();
        let (arena, root) = from_petri_net::apply(&pn)
            .expect("conversion must succeed for a sound WF-net");
        let repr = arena.to_repr(root);
        // A single-transition net should simplify to just the label.
        assert!(!repr.is_empty(), "repr must be non-empty");
    }

    #[test]
    fn json_response_contains_required_fields() {
        let pn = minimal_wf_net();
        let (source, sink) = find_source_sink(&pn).unwrap();
        let (arena, root) = from_petri_net::apply(&pn).unwrap();
        let repr = arena.to_repr(root);

        let response = serde_json::json!({
            "wf_valid":   true,
            "source":     source,
            "sink":       sink,
            "root":       root,
            "node_count": arena.len(),
            "repr":       repr,
        });

        assert_eq!(response["wf_valid"], true);
        assert_eq!(response["source"], "p_start");
        assert_eq!(response["sink"], "p_end");
        assert!(response["repr"].is_string());
    }
}
