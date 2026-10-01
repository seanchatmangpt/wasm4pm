//! Native, no-mock roundtrip tests of the `wasm4pm-ex4pm-bindings` extern
//! "C" ABI — the exact surface Wasmex drives from
//! `ex4pm/lib/ex4pm_engine/wasm/real_transport.ex`:
//!
//! `alloc_v1(len)` -> host writes UTF-8 JSON request bytes into the buffer ->
//! `<algo>_v1(ptr, len, out_len)` -> host reads the UTF-8 JSON response ->
//! `<algo>_replay_v1(ptr, len) == 1` -> `free_v1` (response) +
//! `dealloc_v1` (request, same len).
//!
//! Every call goes through the real exported symbol names declared in the
//! foreign block below (resolved at link time from this crate's own object
//! code), not through Rust item paths, so a wrong or renamed
//! `#[export_name = "wasm4pm_ex4pm_..."]` string fails these tests the same
//! way a Wasmex host fails at `call_function` time.

use serde_json::Value;
use wasm4pm_ex4pm_bindings::version_v1;

// Exact exported symbol names, linked from this crate's rlib.
extern "C" {
    fn wasm4pm_ex4pm_bindings_version_v1() -> u32;
    fn wasm4pm_ex4pm_bindings_alloc_v1(len: usize) -> *mut u8;
    fn wasm4pm_ex4pm_bindings_dealloc_v1(ptr: *mut u8, len: usize);
    fn wasm4pm_ex4pm_bindings_free_v1(ptr: *mut u8, len: usize);

    fn wasm4pm_ex4pm_discover_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8;
    fn wasm4pm_ex4pm_discover_replay_v1(ptr: *const u8, len: usize) -> u32;
    fn wasm4pm_ex4pm_conform_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8;
    fn wasm4pm_ex4pm_conform_replay_v1(ptr: *const u8, len: usize) -> u32;
    fn wasm4pm_ex4pm_simulate_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8;
    fn wasm4pm_ex4pm_simulate_replay_v1(ptr: *const u8, len: usize) -> u32;
    fn wasm4pm_ex4pm_powl_mine_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8;
    fn wasm4pm_ex4pm_powl_mine_replay_v1(ptr: *const u8, len: usize) -> u32;
    fn wasm4pm_ex4pm_mean_v1(ptr: *const u8, len: usize, out_len: *mut usize) -> *mut u8;
    fn wasm4pm_ex4pm_mean_replay_v1(ptr: *const u8, len: usize) -> u32;
}

type AlgoV1 = unsafe extern "C" fn(*const u8, usize, *mut usize) -> *mut u8;
type AlgoReplayV1 = unsafe extern "C" fn(*const u8, usize) -> u32;

/// The real host sequence of `Ex4pmEngine.Wasm.RealTransport.call/3`:
/// alloc -> write request bytes -> invoke -> read response -> free both.
unsafe fn abi_call_raw(algo: AlgoV1, request: &[u8]) -> String {
    let in_ptr = unsafe { wasm4pm_ex4pm_bindings_alloc_v1(request.len()) };
    assert!(!in_ptr.is_null(), "alloc_v1 returned null");
    unsafe { std::ptr::copy_nonoverlapping(request.as_ptr(), in_ptr, request.len()) };

    let mut out_len: usize = 0;
    let out_ptr = unsafe { algo(in_ptr, request.len(), &mut out_len) };
    assert!(!out_ptr.is_null(), "algo export returned a null response buffer");
    assert!(out_len > 0, "algo export reported an empty response");

    let bytes = unsafe { std::slice::from_raw_parts(out_ptr, out_len) };
    let body = std::str::from_utf8(bytes)
        .expect("response buffer is UTF-8")
        .to_owned();

    // The response buffer, then the request buffer with its original len.
    unsafe { wasm4pm_ex4pm_bindings_free_v1(out_ptr, out_len) };
    unsafe { wasm4pm_ex4pm_bindings_dealloc_v1(in_ptr, request.len()) };

    body
}

/// The same host sequence for the `_replay_v1` exports
/// (`Ex4pmEngine.Wasm.RealTransport.replay/3`).
unsafe fn abi_replay(replay: AlgoReplayV1, request: &[u8]) -> u32 {
    let in_ptr = unsafe { wasm4pm_ex4pm_bindings_alloc_v1(request.len()) };
    assert!(!in_ptr.is_null(), "alloc_v1 returned null");
    unsafe { std::ptr::copy_nonoverlapping(request.as_ptr(), in_ptr, request.len()) };
    let verdict = unsafe { replay(in_ptr, request.len()) };
    unsafe { wasm4pm_ex4pm_bindings_dealloc_v1(in_ptr, request.len()) };
    verdict
}

/// Asserts the success envelope `{"result":...,"digest":"<16 lowercase hex>"}`.
fn success_envelope(body: &str) -> Value {
    let v: Value = serde_json::from_str(body).expect("response is valid JSON");
    assert!(v.get("error").is_none(), "unexpected error envelope: {body}");
    assert!(v.get("result").is_some(), "missing result: {body}");
    let digest = v
        .get("digest")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing digest: {body}"));
    assert_eq!(digest.len(), 16, "digest is not 16 chars: {digest}");
    assert!(
        digest
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()),
        "digest is not 16 lowercase hex chars: {digest}"
    );
    v
}

/// Asserts the error envelope `{"error":"..."}` with no result and no digest.
fn error_envelope(body: &str) -> String {
    let v: Value = serde_json::from_str(body).expect("error response is valid JSON");
    assert!(v.get("result").is_none(), "unexpected result envelope: {body}");
    assert!(
        v.get("digest").is_none(),
        "error envelope must not carry a digest: {body}"
    );
    let msg = v
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("error is not a string: {body}"))
        .to_owned();
    assert!(!msg.is_empty(), "empty error message: {body}");
    msg
}

// ---------------------------------------------------------------------------
// Positive roundtrips: alloc -> write -> <algo>_v1 -> read -> replay -> free
// ---------------------------------------------------------------------------

#[test]
fn discover_roundtrip_alloc_write_call_read_replay_free() {
    assert_eq!(unsafe { wasm4pm_ex4pm_bindings_version_v1() }, 1);
    assert_eq!(version_v1(), 1);

    let request = br#"{"traces":[["a","b","c"],["a","b"],["a","b","c"]]}"#;
    let in_ptr = unsafe { wasm4pm_ex4pm_bindings_alloc_v1(request.len()) };
    assert!(!in_ptr.is_null(), "alloc_v1 returned null");
    unsafe { std::ptr::copy_nonoverlapping(request.as_ptr(), in_ptr, request.len()) };

    let mut out_len: usize = 0;
    let out_ptr = unsafe { wasm4pm_ex4pm_discover_v1(in_ptr, request.len(), &mut out_len) };
    assert!(!out_ptr.is_null(), "discover_v1 returned a null response buffer");
    assert!(out_len > 0, "discover_v1 reported an empty response");

    let response = unsafe {
        String::from_utf8_lossy(std::slice::from_raw_parts(out_ptr, out_len)).into_owned()
    };
    unsafe { wasm4pm_ex4pm_bindings_free_v1(out_ptr, out_len) };

    let v = success_envelope(&response);
    let result = &v["result"];
    assert_eq!(result["activities"], serde_json::json!(["a", "b", "c"]));
    assert_eq!(result["edges"][0]["from"], "a");
    assert_eq!(result["edges"][0]["to"], "b");
    assert_eq!(result["edges"][0]["freq"], 3);
    assert_eq!(result["edges"][1]["from"], "b");
    assert_eq!(result["edges"][1]["to"], "c");
    assert_eq!(result["edges"][1]["freq"], 2);

    assert_eq!(
        unsafe { wasm4pm_ex4pm_discover_replay_v1(in_ptr, request.len()) },
        1,
        "discover_replay_v1 must return 1 for the same request bytes"
    );
    unsafe { wasm4pm_ex4pm_bindings_dealloc_v1(in_ptr, request.len()) };
}

#[test]
fn conform_roundtrip_reports_real_fitness_and_replays() {
    let request =
        br#"{"traces":[["a","b"],["a","c"]],"model_edges":[{"from":"a","to":"b"},{"from":"b","to":"c"}]}"#;
    let body = unsafe { abi_call_raw(wasm4pm_ex4pm_conform_v1, request) };
    let v = success_envelope(&body);
    assert_eq!(v["result"]["fit_traces"], 1);
    assert_eq!(v["result"]["total_traces"], 2);
    assert_eq!(v["result"]["fitness"], 0.5);
    assert_eq!(unsafe { abi_replay(wasm4pm_ex4pm_conform_replay_v1, request) }, 1);
}

#[test]
fn simulate_roundtrip_is_deterministic_and_replays() {
    let request =
        br#"{"edges":[{"from":"a","to":"b"},{"from":"b","to":"a"}],"start":"a","steps":4,"seed":42}"#;
    let body1 = unsafe { abi_call_raw(wasm4pm_ex4pm_simulate_v1, request) };
    let body2 = unsafe { abi_call_raw(wasm4pm_ex4pm_simulate_v1, request) };
    assert_eq!(body1, body2, "same request bytes must recompute byte-identically");

    let v = success_envelope(&body1);
    let trace = v["result"]["trace"].as_array().expect("trace is an array");
    assert_eq!(trace.len(), 5, "steps=4 over the a->b->a cycle yields 5 nodes");
    assert_eq!(trace[0], "a");
    assert_eq!(trace[4], "a");
    assert_eq!(unsafe { abi_replay(wasm4pm_ex4pm_simulate_replay_v1, request) }, 1);
}

#[test]
fn powl_mine_roundtrip_detects_a_sequence_and_replays() {
    let request = br#"{"traces":[["a","b","c"],["a","b","c"]]}"#;
    let body = unsafe { abi_call_raw(wasm4pm_ex4pm_powl_mine_v1, request) };
    let v = success_envelope(&body);
    assert_eq!(v["result"]["node_type"], "sequence");
    assert_eq!(v["result"]["children"], serde_json::json!(["a", "b", "c"]));
    assert_eq!(unsafe { abi_replay(wasm4pm_ex4pm_powl_mine_replay_v1, request) }, 1);
}

#[test]
fn powl_mine_roundtrip_covers_the_flower_and_leaf_base_cases() {
    let flower_req = br#"{"traces":[["a","b"],["b","a"]]}"#;
    let body = unsafe { abi_call_raw(wasm4pm_ex4pm_powl_mine_v1, flower_req) };
    let v = success_envelope(&body);
    assert_eq!(v["result"]["node_type"], "flower");
    assert_eq!(v["result"]["children"], serde_json::json!(["a", "b"]));

    let leaf_req = br#"{"traces":[["a"],["a"]]}"#;
    let body = unsafe { abi_call_raw(wasm4pm_ex4pm_powl_mine_v1, leaf_req) };
    let v = success_envelope(&body);
    assert_eq!(v["result"]["node_type"], "leaf");
    assert_eq!(v["result"]["children"], serde_json::json!(["a"]));
}

/// Phase 4 stat through the same ABI: `wasm4pm_ex4pm_mean_v1` /
/// `wasm4pm_ex4pm_mean_replay_v1` (the pair bound by
/// `Ex4pmEngine.Wasm.Mean`).
#[test]
fn mean_roundtrip_phase4_stat_computes_the_real_average_and_replays() {
    let request = br#"{"data":[1.0,2.0,3.0,4.0]}"#;
    let body = unsafe { abi_call_raw(wasm4pm_ex4pm_mean_v1, request) };
    let v = success_envelope(&body);
    assert_eq!(v["result"]["mean"], 2.5);
    assert_eq!(unsafe { abi_replay(wasm4pm_ex4pm_mean_replay_v1, request) }, 1);
}

#[test]
fn empty_discover_roundtrip_yields_an_empty_graph() {
    let request = br#"{"traces":[]}"#;
    let body = unsafe { abi_call_raw(wasm4pm_ex4pm_discover_v1, request) };
    let v = success_envelope(&body);
    assert_eq!(v["result"]["activities"], serde_json::json!([]));
    assert_eq!(v["result"]["edges"], serde_json::json!([]));
    assert_eq!(unsafe { abi_replay(wasm4pm_ex4pm_discover_replay_v1, request) }, 1);
}

// ---------------------------------------------------------------------------
// Negative: malformed / mis-shaped JSON, and tampered request bytes
// ---------------------------------------------------------------------------

#[test]
fn malformed_or_misshaped_json_yields_an_error_envelope_for_every_algo() {
    let cases: &[(&str, AlgoV1, &[u8])] = &[
        ("discover", wasm4pm_ex4pm_discover_v1, br#"{"traces":"#.as_slice()),
        ("conform", wasm4pm_ex4pm_conform_v1, b"not json at all".as_slice()),
        (
            "simulate",
            wasm4pm_ex4pm_simulate_v1,
            br#"{"edges":[],"start":"a"}"#.as_slice(), // missing steps/seed
        ),
        (
            "powl_mine",
            wasm4pm_ex4pm_powl_mine_v1,
            br#"{"traces":42}"#.as_slice(), // wrong type
        ),
        (
            "mean",
            wasm4pm_ex4pm_mean_v1,
            br#"{"data":"nope"}"#.as_slice(), // wrong type
        ),
    ];
    for (name, algo, payload) in cases {
        let body = unsafe { abi_call_raw(*algo, payload) };
        let msg = error_envelope(&body);
        assert!(
            msg.contains("invalid") && msg.contains(name),
            "{name}: error message should name the algo, got: {msg}"
        );
    }
}

#[test]
fn tampered_request_bytes_change_the_response_digest() {
    let original: &[u8] =
        br#"{"edges":[{"from":"a","to":"b"},{"from":"b","to":"a"}],"start":"a","steps":4,"seed":42}"#;
    let mut tampered = original.to_vec();
    let needle: &[u8] = br#""steps":4"#;
    let steps_digit = original
        .windows(needle.len())
        .position(|w| w == needle)
        .expect("steps field present")
        + needle.len()
        - 1; // index of the "4"
    assert_eq!(tampered[steps_digit], b'4', "expected to land on the steps digit");
    tampered[steps_digit] = b'5';

    let orig_body = unsafe { abi_call_raw(wasm4pm_ex4pm_simulate_v1, original) };
    let tamp_body = unsafe { abi_call_raw(wasm4pm_ex4pm_simulate_v1, &tampered) };

    let orig_v = success_envelope(&orig_body);
    let tamp_v = success_envelope(&tamp_body);
    let orig_digest = orig_v["digest"].as_str().expect("digest").to_owned();
    let tamp_digest = tamp_v["digest"].as_str().expect("digest").to_owned();

    assert_ne!(
        orig_digest, tamp_digest,
        "tampering the request must be visible in the response digest"
    );
    assert_eq!(
        tamp_v["result"]["trace"].as_array().expect("trace").len(),
        6,
        "steps=5 yields one more node than steps=4"
    );

    // The tampered bytes themselves are a valid, deterministic request:
    // recomputing them must be byte-identical.
    let tamp_body_again = unsafe { abi_call_raw(wasm4pm_ex4pm_simulate_v1, &tampered) };
    assert_eq!(tamp_body, tamp_body_again);
    assert_eq!(
        unsafe { abi_replay(wasm4pm_ex4pm_simulate_replay_v1, &tampered) },
        1,
        "current replay semantics: recompute of valid tampered bytes succeeds"
    );
}

/// Tripwire for the documented-but-unimplemented replay contract. The module
/// docs promise `<algo>_replay_v1` returns 1 "iff the FNV-1a digest of the
/// recomputed response matches the digest embedded in a prior response's
/// `digest` field", but `replay_ok` in `src/lib.rs` only checks that the
/// recomputed response is non-empty, and the `(ptr, len)` signature carries
/// no prior digest — so replay currently returns 1 for malformed bytes too.
/// This encodes the documented (not yet implemented) behavior; remove the
/// `#[ignore]` when replay actually compares digests.
#[test]
#[ignore = "replay_ok (src/lib.rs) only checks non-empty; enable when replay_v1 compares digests"]
fn tampered_request_fails_replay_once_replay_compares_digests() {
    let malformed: &[u8] = br#"{"traces":"#;
    assert_eq!(unsafe { abi_replay(wasm4pm_ex4pm_discover_replay_v1, malformed) }, 0);
}
