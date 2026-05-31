//! WF-net soundness checking — `#[wasm_bindgen]` WASM exports.
//!
//! Exposes soundness verification for Workflow nets (WF-nets) per van der Aalst
//! criteria as documented in arXiv:2602.15739v3, Definitions 3.1–3.5:
//!
//! 1. **Option to complete** (proper completion) — the final marking is reachable
//!    from the initial marking.
//! 2. **No dead transitions** (weak liveness) — from every reachable marking,
//!    every visible transition can eventually fire.
//! 3. **Boundedness** — no place can accumulate unbounded tokens.
//!
//! The three properties together constitute the classical "soundness" of a
//! WF-net (van der Aalst 1998, TOIT 2011).
//!
//! # WASM Exports
//!
//! | Function | Input | Returns |
//! |---|---|---|
//! | [`check_wf_net_soundness`] | POWL Petri-net JSON | JSON soundness report |

use wasm_bindgen::prelude::*;

use crate::powl::conformance::soundness::check_soundness;
use crate::powl_models::PowlPetriNetResult;

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn wasm_err(msg: &str) -> JsValue {
    crate::error::js_val(msg)
}

// ─── WASM Export ─────────────────────────────────────────────────────────────

/// Check WF-net soundness per van der Aalst criteria (arXiv:2602.15739v3, Defs 3.1–3.5).
///
/// Accepts a Petri-net JSON object (same format as [`powl_to_petri_net`] output or
/// [`from_pnml_wasm`] stripped to the net structure) and verifies the three classical
/// soundness properties of a Workflow net:
///
/// 1. **Option to complete** — the final marking is reachable from the initial marking.
/// 2. **No dead transitions** — every visible transition can eventually fire from
///    every reachable marking.
/// 3. **Boundedness** — no place accumulates more than a configurable token cap
///    (default 100) during reachability exploration.
///
/// The check uses bounded forward reachability analysis (BFS, depth 50) so it
/// terminates in polynomial time for well-structured WF-nets. Unbounded or highly
/// concurrent nets may report `bounded: false` even when theoretically bounded;
/// use alignment-based analysis for those cases.
///
/// # Arguments
///
/// - `pn_json` – JSON string encoding the Petri net and its markings.
///   Expected shape:
///   ```json
///   {
///     "net": {
///       "places": [{ "name": "p_start" }, { "name": "p_end" }],
///       "transitions": [{ "name": "t_A", "label": "A" }],
///       "arcs": [{ "source": "p_start", "target": "t_A" }, { "source": "t_A", "target": "p_end" }]
///     },
///     "initial_marking": { "p_start": 1 },
///     "final_marking":   { "p_end": 1 }
///   }
///   ```
///   This is exactly the JSON produced by `powl_to_petri_net`.
///
/// # Returns
///
/// JSON string with the following fields:
///
/// ```json
/// {
///   "sound":        true,
///   "deadlock_free": true,
///   "bounded":      true,
///   "liveness":     true
/// }
/// ```
///
/// | Field | Type | Meaning |
/// |---|---|---|
/// | `sound` | `bool` | `true` iff all three soundness criteria hold |
/// | `deadlock_free` | `bool` | Alias for `liveness` (dead-transition freedom) |
/// | `bounded` | `bool` | `true` iff no place exceeds the token cap during exploration |
/// | `liveness` | `bool` | `true` iff every visible transition fires in at least one reachable path |
///
/// On parse error, returns a JS `Error` string (not JSON).
///
/// # Academic Reference
///
/// W.M.P. van der Aalst, "Workflow Nets: Basic Notions, Applications, and
/// Complexity," arXiv:2602.15739v3, February 2026. Definitions 3.1–3.5.
///
/// # Examples
///
/// ```ignore
/// // Requires a valid Petri-net JSON produced by `powl_to_petri_net` or manually
/// // constructed. Must run in a WASM context.
/// // See wasm4pm/tests/wf_soundness.rs for native Rust integration tests.
///
/// const pnJson = JSON.stringify({
///   net: {
///     places: [{ name: "start" }, { name: "end" }],
///     transitions: [{ name: "t_A", label: "A" }],
///     arcs: [
///       { source: "start", target: "t_A" },
///       { source: "t_A",   target: "end"  },
///     ],
///   },
///   initial_marking: { start: 1 },
///   final_marking:   { end: 1 },
/// });
///
/// const result = JSON.parse(wasm.check_wf_net_soundness(pnJson));
/// // result → { sound: true, deadlock_free: true, bounded: true, liveness: true }
/// console.assert(result.sound === true, "Sequential A→B net must be sound");
/// ```
#[wasm_bindgen]
pub fn check_wf_net_soundness(pn_json: &str) -> Result<String, JsValue> {
    let result: PowlPetriNetResult = serde_json::from_str(pn_json)
        .map_err(|e| wasm_err(&format!("invalid petri net JSON: {}", e)))?;

    let soundness = check_soundness(
        &result.net,
        &result.initial_marking,
        &result.final_marking,
    );

    serde_json::to_string_pretty(&soundness)
        .map_err(|e| wasm_err(&format!("json serialization error: {}", e)))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use crate::powl::conformance::soundness::check_soundness;
    use crate::powl_models::{PowlPetriNet, PowlPetriNetResult};
    use std::collections::HashMap;

    /// Build a minimal sound WF-net: start → A → end.
    fn minimal_sound_net() -> PowlPetriNetResult {
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
    fn sound_minimal_net_passes_all_criteria() {
        let pn = minimal_sound_net();
        let result = check_soundness(&pn.net, &pn.initial_marking, &pn.final_marking);
        assert!(result.sound, "minimal A net must be sound");
        assert!(result.deadlock_free);
        assert!(result.bounded);
        assert!(result.liveness);
    }

    #[test]
    fn unsound_net_missing_arc_fails_proper_completion() {
        // Net with no arc from t_A to p_end — final marking unreachable.
        let mut net = PowlPetriNet::new("broken");
        net.add_place("p_start");
        net.add_place("p_end");
        net.add_transition("t_A", Some("A".into()));
        net.add_arc("p_start", "t_A");
        // Deliberately no arc t_A → p_end

        let mut initial = HashMap::new();
        initial.insert("p_start".to_string(), 1);
        let mut final_m = HashMap::new();
        final_m.insert("p_end".to_string(), 1);

        let result = check_soundness(&net, &initial, &final_m);
        // Proper completion fails; overall sound must be false.
        assert!(!result.sound, "net with missing arc cannot be sound");
    }

    #[test]
    fn json_roundtrip_preserves_soundness_fields() {
        let pn = minimal_sound_net();
        let result = check_soundness(&pn.net, &pn.initial_marking, &pn.final_marking);
        let json = serde_json::to_string(&result).expect("serialization failed");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse failed");

        assert_eq!(parsed["sound"], true);
        assert_eq!(parsed["deadlock_free"], true);
        assert_eq!(parsed["bounded"], true);
        assert_eq!(parsed["liveness"], true);
    }
}
