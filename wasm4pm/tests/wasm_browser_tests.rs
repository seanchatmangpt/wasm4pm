//! WASM browser target tests — executed by `wasm-pack test --headless --chrome`.
//!
//! These tests verify that the compiled WASM module behaves correctly in an
//! actual browser environment (not just native Rust). Memory layout differences,
//! serialization quirks, and browser-specific behavior are invisible to native
//! `cargo test` but surface here.
//!
//! Run with:
//!   wasm-pack test --headless --chrome -- --test wasm_browser_tests

use wasm_bindgen_test::*;

// Run in a headless browser (chromium via wasm-pack test --headless --chrome)
wasm_bindgen_test_configure!(run_in_browser);

// ---------------------------------------------------------------------------
// Module API smoke tests — verify WASM exports are callable in the browser
// ---------------------------------------------------------------------------

#[wasm_bindgen_test]
fn browser_get_version_returns_non_empty() {
    let version = wasm4pm::get_version();
    assert!(
        !version.is_empty(),
        "get_version() must return a non-empty string in browser"
    );
}

#[wasm_bindgen_test]
fn browser_get_capabilities_returns_ok() {
    let result = wasm4pm::get_capabilities();
    assert!(
        result.is_ok(),
        "get_capabilities() must return Ok in browser, got Err"
    );
}

#[wasm_bindgen_test]
fn browser_get_cache_stats_returns_ok() {
    let result = wasm4pm::get_cache_stats();
    assert!(
        result.is_ok(),
        "get_cache_stats() must return Ok in browser"
    );
}

// ---------------------------------------------------------------------------
// Round-trip: load a minimal XES log and discover a DFG in the browser
// ---------------------------------------------------------------------------

#[wasm_bindgen_test]
fn browser_load_xes_and_discover_dfg() {
    // Minimal valid XES with 2 traces
    let xes = r#"<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xes.features="">
  <trace>
    <string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="B"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event><string key="concept:name" value="A"/></event>
    <event><string key="concept:name" value="C"/></event>
  </trace>
</log>"#;

    let handle = wasm4pm::load_eventlog_from_xes(xes);
    assert!(
        handle.is_ok(),
        "load_eventlog_from_xes() must succeed in browser"
    );
    let handle = handle.unwrap();
    assert!(!handle.is_empty(), "Handle must be non-empty");

    let dfg_json = wasm4pm::discover_dfg(&handle, "concept:name");
    assert!(dfg_json.is_ok(), "discover_dfg() must succeed in browser");
    let dfg_str = format!("{:?}", dfg_json.unwrap());
    assert!(
        dfg_str.contains("nodes") || dfg_str.contains("edges"),
        "DFG result must contain nodes or edges: got {dfg_str}"
    );

    // Clean up
    let _ = wasm4pm::delete_object(&handle);
}

#[wasm_bindgen_test]
fn browser_load_xes_delete_then_reject() {
    let xes = r#"<?xml version="1.0"?>
<log xes.version="1.0">
  <trace>
    <event><string key="concept:name" value="A"/></event>
  </trace>
</log>"#;

    let handle = wasm4pm::load_eventlog_from_xes(xes).expect("load must succeed");
    wasm4pm::delete_object(&handle).expect("delete must succeed");

    // After deletion, further use of the handle must fail gracefully
    let dfg = wasm4pm::discover_dfg(&handle, "concept:name");
    assert!(dfg.is_err(), "Using a deleted handle must return an error");
}
