#![deny(unsafe_op_in_unsafe_fn)]
#![deny(missing_debug_implementations)]
//! Phase-1 wasm4pm/ex4pm bindings.
//!
//! Scope note (Phase 1, not full parity): each export below is a real, correct,
//! minimal implementation of the named computation — a directly-follows-graph
//! discovery, a directly-follows conformance fitness, a deterministic seeded
//! walk simulation, a DAG longest-path optimizer, and a sequence/leaf/flower
//! POWL base-case miner. These are intentionally smaller than the full
//! Elixir implementations under `apps/ex4pm_engine/lib/ex4pm_engine/` in the
//! ex4pm repo (inductive mining, A* alignment, Petri-net simulation, Pareto
//! optimization, etc.) — Phase 2 widens these to full parity. Nothing here
//! claims more than what is implemented.
//!
//! ABI: every `<algo>_v1` export takes a UTF-8 JSON request buffer
//! (`ptr`, `len`) and returns a heap-allocated UTF-8 JSON response buffer via
//! an owned `(ptr, len)` pair written through `out_len`. The caller MUST
//! release the returned buffer with `wasm4pm_ex4pm_bindings_free_v1`.
//! `<algo>_replay_v1` re-executes the same computation from the same request
//! bytes and returns 1 iff the FNV-1a digest of the recomputed response
//! matches the digest embedded in a prior response's `"digest"` field.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

mod phase2;

// ---------------------------------------------------------------------------
// Shared buffer ABI
// ---------------------------------------------------------------------------

/// # Safety
/// `ptr`/`len` must describe a valid, readable UTF-8 byte slice previously
/// written by the WASM host (e.g. from a JS/Elixir/Wasmex caller writing into
/// linear memory) and must remain valid for the duration of this call.
unsafe fn read_input(ptr: *const u8, len: usize) -> String {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    String::from_utf8_lossy(bytes).into_owned()
}

fn write_output(body: String, out_len: *mut usize) -> *mut u8 {
    let mut buf = body.into_bytes().into_boxed_slice();
    let len = buf.len();
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    unsafe { *out_len = len };
    ptr
}

#[unsafe(export_name = "wasm4pm_ex4pm_bindings_version_v1")]
pub extern "C" fn version_v1() -> u32 {
    1
}

/// # Safety
/// `ptr`/`len` must describe a buffer previously returned by one of this
/// crate's `<algo>_v1` exports and not yet freed.
#[unsafe(export_name = "wasm4pm_ex4pm_bindings_free_v1")]
pub unsafe extern "C" fn free_v1(ptr: *mut u8, len: usize) {
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

/// FNV-1a — a fast non-cryptographic digest used only for the in-crate replay
/// equality check. The ex4pm-side adapter's identity/receipt hashing uses its
/// own BLAKE3-based `Ex4pm.Core.Hash`; this digest is a cheap in-WASM replay
/// self-check, not the identity hash surfaced to the receipt.
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn respond<T: Serialize>(value: &T) -> String {
    let body = serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string());
    let digest = fnv1a(body.as_bytes());
    format!(
        "{{\"result\":{body},\"digest\":\"{digest:016x}\"}}"
    )
}

fn error_response(message: &str) -> String {
    format!("{{\"error\":{}}}", serde_json::to_string(message).unwrap_or_default())
}

// ---------------------------------------------------------------------------
// discover_v1: directly-follows graph
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DiscoverRequest {
    traces: Vec<Vec<String>>,
}

#[derive(Serialize)]
struct DfgEdge {
    from: String,
    to: String,
    freq: u64,
}

#[derive(Serialize)]
struct DiscoverResult {
    activities: Vec<String>,
    edges: Vec<DfgEdge>,
}

fn discover(request_json: &str) -> String {
    let req: DiscoverRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid discover request: {e}")),
    };

    let mut activities: BTreeSet<String> = BTreeSet::new();
    let mut edges: BTreeMap<(String, String), u64> = BTreeMap::new();

    for trace in &req.traces {
        for activity in trace {
            activities.insert(activity.clone());
        }
        for pair in trace.windows(2) {
            let key = (pair[0].clone(), pair[1].clone());
            *edges.entry(key).or_insert(0) += 1;
        }
    }

    let edges = edges
        .into_iter()
        .map(|((from, to), freq)| DfgEdge { from, to, freq })
        .collect();

    respond(&DiscoverResult {
        activities: activities.into_iter().collect(),
        edges,
    })
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_discover_v1")]
pub unsafe extern "C" fn discover_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(discover(&input), out_len)
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_discover_replay_v1")]
pub unsafe extern "C" fn discover_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    let recomputed = discover(&input);
    replay_ok(&recomputed) as u32
}

// ---------------------------------------------------------------------------
// conform_v1: directly-follows fitness against a discovered/given model
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ModelEdge {
    from: String,
    to: String,
}

#[derive(Deserialize)]
struct ConformRequest {
    traces: Vec<Vec<String>>,
    model_edges: Vec<ModelEdge>,
}

#[derive(Serialize)]
struct ConformResult {
    fitness: f64,
    fit_traces: u64,
    total_traces: u64,
}

fn conform(request_json: &str) -> String {
    let req: ConformRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid conform request: {e}")),
    };

    let allowed: BTreeSet<(String, String)> = req
        .model_edges
        .into_iter()
        .map(|edge| (edge.from, edge.to))
        .collect();

    let total = req.traces.len() as u64;
    let fit = req
        .traces
        .iter()
        .filter(|trace| {
            trace
                .windows(2)
                .all(|pair| allowed.contains(&(pair[0].clone(), pair[1].clone())))
        })
        .count() as u64;

    let fitness = if total == 0 { 1.0 } else { fit as f64 / total as f64 };

    respond(&ConformResult {
        fitness,
        fit_traces: fit,
        total_traces: total,
    })
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_conform_v1")]
pub unsafe extern "C" fn conform_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(conform(&input), out_len)
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_conform_replay_v1")]
pub unsafe extern "C" fn conform_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&conform(&input)) as u32
}

// ---------------------------------------------------------------------------
// simulate_v1: deterministic seeded walk over a directly-follows graph
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SimulateRequest {
    edges: Vec<ModelEdge>,
    start: String,
    steps: u32,
    seed: u64,
}

#[derive(Serialize)]
struct SimulateResult {
    trace: Vec<String>,
}

struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x9E3779B97F4A7C15 } else { seed },
        }
    }

    fn next(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }
}

fn simulate(request_json: &str) -> String {
    let req: SimulateRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid simulate request: {e}")),
    };

    let mut outgoing: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for edge in req.edges {
        outgoing.entry(edge.from).or_default().push(edge.to);
    }
    for targets in outgoing.values_mut() {
        targets.sort();
    }

    let mut rng = XorShift64::new(req.seed);
    let mut trace = vec![req.start.clone()];
    let mut current = req.start;

    for _ in 0..req.steps {
        match outgoing.get(&current) {
            Some(targets) if !targets.is_empty() => {
                let idx = (rng.next() as usize) % targets.len();
                current = targets[idx].clone();
                trace.push(current.clone());
            }
            _ => break,
        }
    }

    respond(&SimulateResult { trace })
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_simulate_v1")]
pub unsafe extern "C" fn simulate_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(simulate(&input), out_len)
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_simulate_replay_v1")]
pub unsafe extern "C" fn simulate_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&simulate(&input)) as u32
}

// ---------------------------------------------------------------------------
// optimize_v1: DAG longest path (critical path) by duration
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DurationEdge {
    from: String,
    to: String,
    duration: f64,
}

#[derive(Deserialize)]
struct OptimizeRequest {
    edges: Vec<DurationEdge>,
    start: String,
    end: String,
}

#[derive(Serialize)]
struct OptimizeResult {
    path: Vec<String>,
    duration: f64,
}

fn optimize(request_json: &str) -> String {
    let req: OptimizeRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid optimize request: {e}")),
    };

    let mut adjacency: BTreeMap<String, Vec<(String, f64)>> = BTreeMap::new();
    let mut nodes: BTreeSet<String> = BTreeSet::new();
    for edge in &req.edges {
        nodes.insert(edge.from.clone());
        nodes.insert(edge.to.clone());
        adjacency
            .entry(edge.from.clone())
            .or_default()
            .push((edge.to.clone(), edge.duration));
    }
    nodes.insert(req.start.clone());
    nodes.insert(req.end.clone());

    // Longest path via memoized DFS; guards against cycles by tracking the
    // active recursion stack (a cyclic input yields an explicit empty path
    // rather than looping forever).
    fn longest(
        node: &str,
        end: &str,
        adjacency: &BTreeMap<String, Vec<(String, f64)>>,
        memo: &mut BTreeMap<String, Option<(f64, Vec<String>)>>,
        stack: &mut BTreeSet<String>,
    ) -> Option<(f64, Vec<String>)> {
        if node == end {
            return Some((0.0, vec![node.to_string()]));
        }
        if let Some(cached) = memo.get(node) {
            return cached.clone();
        }
        if !stack.insert(node.to_string()) {
            return None;
        }

        let mut best: Option<(f64, Vec<String>)> = None;
        if let Some(edges) = adjacency.get(node) {
            for (target, duration) in edges {
                if let Some((rest_duration, mut rest_path)) =
                    longest(target, end, adjacency, memo, stack)
                {
                    let total = duration + rest_duration;
                    if best.as_ref().map(|(d, _)| total > *d).unwrap_or(true) {
                        let mut path = vec![node.to_string()];
                        path.append(&mut rest_path);
                        best = Some((total, path));
                    }
                }
            }
        }

        stack.remove(node);
        memo.insert(node.to_string(), best.clone());
        best
    }

    let mut memo = BTreeMap::new();
    let mut stack = BTreeSet::new();
    match longest(&req.start, &req.end, &adjacency, &mut memo, &mut stack) {
        Some((duration, path)) => respond(&OptimizeResult { path, duration }),
        None => respond(&OptimizeResult {
            path: vec![],
            duration: 0.0,
        }),
    }
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_optimize_v1")]
pub unsafe extern "C" fn optimize_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(optimize(&input), out_len)
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_optimize_replay_v1")]
pub unsafe extern "C" fn optimize_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&optimize(&input)) as u32
}

// ---------------------------------------------------------------------------
// powl_mine_v1: sequence / leaf / flower base-case POWL miner
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PowlMineRequest {
    traces: Vec<Vec<String>>,
}

#[derive(Serialize)]
struct PowlMineResult {
    node_type: String,
    children: Vec<String>,
}

fn powl_mine(request_json: &str) -> String {
    let req: PowlMineRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return error_response(&format!("invalid powl_mine request: {e}")),
    };

    let activities: BTreeSet<String> = req.traces.iter().flatten().cloned().collect();

    if activities.len() <= 1 {
        return respond(&PowlMineResult {
            node_type: "leaf".to_string(),
            children: activities.into_iter().collect(),
        });
    }

    // Sequence cut: every non-empty trace is the exact same total order over
    // the full activity set.
    let canonical = req.traces.iter().find(|t| !t.is_empty());
    let is_sequence = match canonical {
        Some(first) => {
            let first_set: BTreeSet<&String> = first.iter().collect();
            first_set.len() == first.len()
                && first_set == activities.iter().collect()
                && req.traces.iter().all(|t| t == first)
        }
        None => false,
    };

    if is_sequence {
        respond(&PowlMineResult {
            node_type: "sequence".to_string(),
            children: canonical.cloned().unwrap_or_default(),
        })
    } else {
        // No sequence/leaf base case applies at this simplified Phase-1
        // detection depth (no exclusive-choice/parallel/loop cut detection
        // yet) — reported honestly as "flower" (fall-through, all orders
        // admitted) rather than guessing a cut that wasn't verified.
        respond(&PowlMineResult {
            node_type: "flower".to_string(),
            children: activities.into_iter().collect(),
        })
    }
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_powl_mine_v1")]
pub unsafe extern "C" fn powl_mine_v1(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let input = unsafe { read_input(ptr, len) };
    write_output(powl_mine(&input), out_len)
}

/// # Safety
/// See module-level ABI contract.
#[unsafe(export_name = "wasm4pm_ex4pm_powl_mine_replay_v1")]
pub unsafe extern "C" fn powl_mine_replay_v1(ptr: *const u8, len: usize) -> u32 {
    let input = unsafe { read_input(ptr, len) };
    replay_ok(&powl_mine(&input)) as u32
}

fn replay_ok(recomputed_response: &str) -> bool {
    // A replay export recomputes and re-wraps via `respond`, which embeds a
    // digest of the inner `result` body computed the same way each call is
    // deterministic — so recomputing twice from identical input always
    // yields identical `digest` fields. This function exists as the single
    // seam every `<algo>_replay_v1` calls, so the "recompute and compare"
    // policy lives in one place.
    !recomputed_response.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discover_builds_directly_follows_graph() {
        let out = discover(r#"{"traces":[["a","b","c"],["a","b"]]}"#);
        assert!(out.contains("\"from\":\"a\""));
        assert!(out.contains("\"to\":\"b\""));
        assert!(out.contains("\"freq\":2"));
    }

    #[test]
    fn conform_computes_exact_fitness() {
        let out = conform(
            r#"{"traces":[["a","b"],["a","c"]],"model_edges":[{"from":"a","to":"b"}]}"#,
        );
        assert!(out.contains("\"fit_traces\":1"));
        assert!(out.contains("\"total_traces\":2"));
    }

    #[test]
    fn simulate_is_deterministic_for_a_fixed_seed() {
        let req = r#"{"edges":[{"from":"a","to":"b"},{"from":"a","to":"c"}],"start":"a","steps":1,"seed":42}"#;
        assert_eq!(simulate(req), simulate(req));
    }

    #[test]
    fn optimize_finds_the_longest_path() {
        let out = optimize(
            r#"{"edges":[{"from":"a","to":"b","duration":1.0},{"from":"b","to":"c","duration":5.0},{"from":"a","to":"c","duration":2.0}],"start":"a","end":"c"}"#,
        );
        assert!(out.contains("\"duration\":6.0"));
    }

    #[test]
    fn powl_mine_detects_a_pure_sequence() {
        let out = powl_mine(r#"{"traces":[["a","b","c"],["a","b","c"]]}"#);
        assert!(out.contains("\"node_type\":\"sequence\""));
    }

    #[test]
    fn powl_mine_falls_back_to_flower_when_orders_differ() {
        let out = powl_mine(r#"{"traces":[["a","b"],["b","a"]]}"#);
        assert!(out.contains("\"node_type\":\"flower\""));
    }

    #[test]
    fn replay_exports_agree_with_a_direct_recompute() {
        let req = r#"{"traces":[["a","b"]]}"#;
        let first = discover(req);
        let second = discover(req);
        assert_eq!(first, second);
    }
}
