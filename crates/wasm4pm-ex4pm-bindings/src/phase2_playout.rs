//! Phase 2 — `playout`: thin wrapper over `wasm4pm::petri_net_playout::play_petri_net`.
//!
//! Per `phase2.rs`'s own scope note, `playout` was originally deferred because
//! `wasm4pm`'s only exposed entry point was the `#[wasm_bindgen]`
//! JsValue/handle-store `petri_net_playout` function, incompatible with this
//! crate's raw ptr/len `extern "C"` + Wasmtime/Wasmex ABI. `play_petri_net`
//! itself (`wasm4pm::petri_net_playout::play_petri_net`) was already a pure,
//! JsValue-free `pub fn` taking `&PetriNet, &PlayoutConfig -> Result<PlayoutResult, String>`
//! — no upstream visibility change was needed, only adding `wasm4pm` (with its
//! `petri_net_playout` feature) as a dependency of this crate.

use serde::Deserialize;
use wasm4pm::models::PetriNet;
use wasm4pm::petri_net_playout::{play_petri_net, PlayoutConfig};

#[derive(Deserialize)]
struct PlayoutRequest {
    petri_net: PetriNet,
    config: PlayoutConfig,
}

fn playout(request_json: &str) -> String {
    let req: PlayoutRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return crate::error_response(&format!("invalid playout request: {e}")),
    };

    match play_petri_net(&req.petri_net, &req.config) {
        Ok(result) => crate::respond(&result),
        Err(e) => crate::error_response(&e),
    }
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_playout_v1")]
pub unsafe extern "C" fn playout_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::write_output(playout(&input), out_len)
}

/// # Safety
/// See `crate`'s module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_playout_replay_v1")]
pub unsafe extern "C" fn playout_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { crate::read_input(ptr, len) };
    crate::replay_ok(&playout(&input)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playout_produces_a_real_trace_from_a_two_transition_net() {
        let req = r#"{
            "petri_net": {
                "places": [
                    {"id": "p1", "label": "start", "marking": 1},
                    {"id": "p2", "label": "middle", "marking": 0},
                    {"id": "p3", "label": "end", "marking": 0}
                ],
                "transitions": [
                    {"id": "t1", "label": "a", "is_invisible": false},
                    {"id": "t2", "label": "b", "is_invisible": false}
                ],
                "arcs": [
                    {"from": "p1", "to": "t1", "weight": 1},
                    {"from": "t1", "to": "p2", "weight": 1},
                    {"from": "p2", "to": "t2", "weight": 1},
                    {"from": "t2", "to": "p3", "weight": 1}
                ],
                "initial_marking": {"p1": 1},
                "final_markings": [{"p3": 1}]
            },
            "config": {"max_trace_length": 10, "num_traces": 5, "random_seed": 7}
        }"#;

        let out = playout(req);
        assert!(!out.contains("\"error\""), "unexpected error: {out}");
        assert!(out.contains("\"traces\":["));
        assert!(
            out.contains("\"all_complete\":true"),
            "expected deadlock-free run: {out}"
        );
    }
}
