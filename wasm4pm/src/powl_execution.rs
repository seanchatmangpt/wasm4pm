//! POWL workflow execution engine — proof-carrying execution via `bcinr-powl`.
//!
//! Bridges wasm4pm's POWL arena model to the `bcinr-powl` executor: compiles
//! the model to a 64-slot tape, runs the branchless scheduler to completion,
//! records the firing into an OCEL log, self-validates the log against the
//! tape, and emits a BLAKE3-hashed execution receipt.
//!
//! ## WASM exports (feature `powl-engine`)
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `powl_execute` | Execute a POWL model string; returns receipt + OCEL 2.0 log |
//!
//! Execution is fully deterministic: the bcinr scheduler resolves XOR choices
//! branchlessly to the lowest-index branch, so the same model + config always
//! yields the same firing order, OCEL log, and chain hash.

use serde_json::json;
use wasm_bindgen::prelude::*;

use crate::error::{codes, wasm_err as typed_wasm_err};

fn wasm_err(msg: &str) -> JsValue {
    typed_wasm_err(codes::INVALID_INPUT, msg)
}
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use crate::powl_parser::parse_powl_model_string;
use crate::utilities::to_js_str;

use bcinr_powl::compiler::{compile_powl, PowlAstNode};
use bcinr_powl::ocel::{validate_against_tape, ConformanceResult, OcelLog};
use bcinr_powl::scheduler::{scheduler_tick, PowlRunState};
use bcinr_powl::tape::OpKind;

/// Safety cap on scheduler ticks (a 64-slot tape with bounded loops finishes
/// far below this; the cap only guards against unbounded `max_iters = 0` loops).
const MAX_TICKS: u32 = 4096;

/// Convert a wasm4pm POWL arena subtree into a bcinr-powl AST.
///
/// `labels` receives every labeled-transition name in compile traversal order
/// (the bcinr compiler allocates Atom slots in exactly this order, which lets
/// us map tape slots back to activity names after compilation).
fn to_engine_ast<'a>(
    arena: &'a PowlArena,
    idx: u32,
    max_iters: u8,
    labels: &mut Vec<&'a str>,
) -> Result<PowlAstNode<'a>, String> {
    let node = arena
        .get(idx)
        .ok_or_else(|| format!("dangling arena index {idx}"))?;
    match node {
        PowlNode::Transition(t) => match t.label.as_deref() {
            Some(l) => {
                labels.push(l);
                Ok(PowlAstNode::Atom(l))
            }
            None => Ok(PowlAstNode::Silent),
        },
        PowlNode::FrequentTransition(t) => {
            labels.push(&t.label);
            Ok(PowlAstNode::Atom(&t.label))
        }
        PowlNode::StrictPartialOrder(po) => {
            let mut children = Vec::with_capacity(po.children.len());
            for &c in &po.children {
                children.push(to_engine_ast(arena, c, max_iters, labels)?);
            }
            let edges = po
                .order
                .edge_list()
                .into_iter()
                .collect::<Vec<(usize, usize)>>();
            Ok(PowlAstNode::PartialOrder { children, edges })
        }
        PowlNode::OperatorPowl(op) => match op.operator {
            Operator::Xor => {
                let mut children = Vec::with_capacity(op.children.len());
                for &c in &op.children {
                    children.push(to_engine_ast(arena, c, max_iters, labels)?);
                }
                Ok(PowlAstNode::XorChoice(children))
            }
            Operator::Loop => {
                if op.children.len() != 2 {
                    return Err(format!(
                        "loop node must have exactly 2 children (body, redo), got {}",
                        op.children.len()
                    ));
                }
                let body = to_engine_ast(arena, op.children[0], max_iters, labels)?;
                let redo = to_engine_ast(arena, op.children[1], max_iters, labels)?;
                Ok(PowlAstNode::Loop {
                    body: Box::new(body),
                    redo: Box::new(redo),
                    max_iters,
                })
            }
            Operator::PartialOrder => {
                let mut children = Vec::with_capacity(op.children.len());
                for &c in &op.children {
                    children.push(to_engine_ast(arena, c, max_iters, labels)?);
                }
                Ok(PowlAstNode::PartialOrder {
                    children,
                    edges: Vec::new(),
                })
            }
        },
        PowlNode::DecisionGraph(_) | PowlNode::ChoiceGraph(_) => {
            Err("decision/choice-graph POWL nodes are not executable by the engine yet".to_string())
        }
    }
}

/// Pure core: execute a POWL model string, returning receipt + OCEL + conformance.
///
/// Accepts both POWL v1 (`X (a, b)`, `PO=(...)`) and POWL v2 (`Activity(...)`,
/// operator syntax) model strings — v2 is the present-state grammar in the
/// PDDL (future) / POWL v2 (present) / OCEL 2.0 (past) triad; the emitted log
/// is OCEL 2.0.
pub fn execute_powl_string(powl_str: &str, max_iters: u8) -> Result<serde_json::Value, String> {
    let mut arena = PowlArena::new();
    let trimmed = powl_str.trim();
    // Dispatch by grammar prefix: the v1 parser accepts almost any text as a
    // bare activity label, so a fallback chain would swallow v2 models whole.
    let is_v2 = ["Activity(", "PartialOrder(", "ChoiceGraph(", "Loop("]
        .iter()
        .any(|p| trimmed.starts_with(p));
    let root = if is_v2 {
        crate::powl_parser::parse_powl_v2_string(trimmed, &mut arena)
            .map_err(|e| format!("POWL v2 parse error: {e}"))?
    } else {
        parse_powl_model_string(trimmed, &mut arena).map_err(|e| format!("parse error: {e}"))?
    };

    let mut labels: Vec<&str> = Vec::new();
    let ast = to_engine_ast(&arena, root, max_iters, &mut labels)?;
    let tape = compile_powl(&ast).map_err(|e| format!("compile error: {e:?}"))?;

    // Map Atom slots (ascending index) back to activity labels: the compiler
    // allocates Atom slots in AST traversal order, matching `labels`.
    let atom_slots: Vec<usize> = (0..tape.len as usize)
        .filter(|&i| matches!(tape.ops[i].kind, OpKind::Atom))
        .collect();
    if atom_slots.len() != labels.len() {
        return Err(format!(
            "internal label mapping mismatch: {} atom slots vs {} labels",
            atom_slots.len(),
            labels.len()
        ));
    }
    let mut slot_label: Vec<Option<&str>> = vec![None; tape.len as usize];
    for (slot, label) in atom_slots.iter().zip(labels.iter()) {
        slot_label[*slot] = Some(label);
    }

    // Deterministic run id from the model text and config.
    let run_id_hash = blake3::hash(format!("{powl_str}\u{1e}{max_iters}").as_bytes());
    let run_id = u64::from_le_bytes(run_id_hash.as_bytes()[..8].try_into().unwrap());

    // Execute: tick until quiescent, recording fired ops in order.
    let mut state = PowlRunState::new(&tape);
    let mut ocel_log = OcelLog::default();
    let mut topo_order: Vec<u32> = Vec::new();
    let mut op_trace: u64 = 0;
    let mut overflow = false;
    let mut ticks = 0u32;
    loop {
        let fired = scheduler_tick(&tape.ops[..tape.len as usize], &mut state);
        if fired.0 == 0 {
            break;
        }
        let mut bits = fired.0;
        while bits != 0 {
            let i = bits.trailing_zeros();
            bits &= bits - 1;
            op_trace |= 1u64 << i;
            topo_order.push(i);
            if ocel_log
                .record_op_fired(run_id, i, tape.ops[i as usize].kind as u8)
                .is_err()
            {
                overflow = true;
            }
        }
        ticks += 1;
        if ticks >= MAX_TICKS {
            overflow = true;
            break;
        }
    }
    if ocel_log.record_run_sealed(run_id, op_trace).is_err() {
        overflow = true;
    }

    // The crate validator requires ALL predecessors fired, which is only
    // correct for XOR-free tapes (an XOR run legitimately suppresses the
    // unchosen branch). For tapes with XorDispatch ops, validate with the
    // scheduler's own semantics: Join preds are masked by choice_taken, and
    // every effective predecessor must fire BEFORE its dependent.
    let has_xor = (0..tape.len as usize).any(|i| matches!(tape.ops[i].kind, OpKind::XorDispatch));
    let conformance = if has_xor {
        let mut fired_before: u64 = 0;
        let mut verdict = "conforms".to_string();
        for &i in &topo_order {
            let op = &tape.ops[i as usize];
            let effective_pred = if matches!(op.kind, OpKind::Join) {
                op.pred_mask & state.choice_taken
            } else {
                op.pred_mask
            };
            // LoopRedo re-fires body ops: allow preds satisfied by any prior fire.
            let missing = effective_pred & !fired_before & !(1u64 << i);
            if missing != 0 && !matches!(op.kind, OpKind::LoopRedo) {
                verdict = format!("Violation {{ op_idx: {i}, missing_pred_mask: {missing:#x} }}");
                break;
            }
            fired_before |= 1u64 << i;
        }
        verdict
    } else {
        match validate_against_tape(&ocel_log, &tape) {
            ConformanceResult::Conforms => "conforms".to_string(),
            other => format!("{other:?}"),
        }
    };

    // Chain hash: model text + firing order + op trace (content-addressed replay).
    let mut hasher = blake3::Hasher::new();
    hasher.update(powl_str.as_bytes());
    hasher.update(&op_trace.to_le_bytes());
    for &op in &topo_order {
        hasher.update(&op.to_le_bytes());
    }
    let chain_hash = hasher.finalize().to_hex().to_string();

    let fired_activities: Vec<serde_json::Value> = topo_order
        .iter()
        .map(|&i| {
            json!({
                "slot": i,
                "kind": format!("{:?}", tape.ops[i as usize].kind),
                "activity": slot_label[i as usize],
            })
        })
        .collect();

    let ocel_json: serde_json::Value = serde_json::from_str(
        &ocel_log
            .to_ocel_json()
            .map_err(|e| format!("OCEL serialization failed: {e}"))?,
    )
    .map_err(|e| format!("OCEL JSON invalid: {e}"))?;

    Ok(json!({
        "algorithm": "powl_execute",
        "engine": "bcinr-powl",
        "receipt": {
            "run_id": format!("{run_id:016x}"),
            "op_trace": format!("{op_trace:#018x}"),
            "topo_order": topo_order,
            "event_count": topo_order.len(),
            "chain_hash": chain_hash,
            "overflow": overflow,
            "ticks": ticks,
        },
        "fired": fired_activities,
        "conformance": conformance,
        "ocel": ocel_json,
    }))
}

/// Execute a POWL model with the proof-carrying bcinr-powl engine.
///
/// `config_json`: optional `{"max_iters": u8}` (loop redo bound, default 3;
/// 0 = unlimited, guarded by the tick cap).
#[wasm_bindgen]
pub fn powl_execute(powl_str: &str, config_json: &str) -> Result<JsValue, JsValue> {
    let max_iters: u8 = if config_json.trim().is_empty() {
        3
    } else {
        let cfg: serde_json::Value = serde_json::from_str(config_json).map_err(|e| {
            typed_wasm_err(codes::INVALID_JSON, format!("invalid config JSON: {e}"))
        })?;
        u8::try_from(cfg.get("max_iters").and_then(|v| v.as_u64()).unwrap_or(3))
            .map_err(|_| typed_wasm_err(codes::INVALID_INPUT, "max_iters must fit in u8"))?
    };
    let result = execute_powl_string(powl_str, max_iters)
        .map_err(|e| typed_wasm_err(codes::INVALID_INPUT, e))?;
    to_js_str(&result)
}
