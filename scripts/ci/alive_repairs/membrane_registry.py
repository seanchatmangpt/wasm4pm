#!/usr/bin/env python3
"""Align the membrane witness and remove unsafe global registry aliases."""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"PATCH_ADMISSION_REFUSED {path}: expected one match, observed {count}"
        )
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


membrane = "wasm4pm/src/automembrane.rs"
replace_once(
    membrane,
    '''        let (final_verdict, _) = compose_verdicts(&layers);
        assert_eq!(final_verdict, Verdict::Allow);
        assert!(is_downstream_admitted(&final_verdict));
''',
    '''        let (final_verdict, decisive_layer) = compose_verdicts(&layers);
        assert_eq!(final_verdict, Verdict::Warn);
        assert_eq!(decisive_layer, "composite");
        assert!(is_downstream_admitted(&final_verdict));
''',
)

registry = "wasm4pm/src/probabilistic/wasm_bindings.rs"
replace_once(
    registry,
    '''use crate::probabilistic::streaming_log::StreamingLog;
use wasm_bindgen::prelude::*;

/// Global store for StreamingLog instances, keyed by handle.
#[allow(static_mut_refs)]
static mut STREAMING_LOGS: Option<std::collections::HashMap<usize, StreamingLog>> = None;

/// Initialize the global store (called lazily).
#[allow(static_mut_refs)]
fn ensure_store() {
    // SAFETY: WASM is single-threaded (no true concurrency in wasm32 target),
    // so there is no data race on this static. The store is only accessed
    // through `with_store()` which always calls `ensure_store()` first.
    unsafe {
        if STREAMING_LOGS.is_none() {
            STREAMING_LOGS = Some(std::collections::HashMap::new());
        }
    }
}

/// Get a mutable reference to the store.
fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut std::collections::HashMap<usize, StreamingLog>) -> R,
{
    ensure_store();
    // SAFETY: ensure_store() guarantees STREAMING_LOGS is Some.
    let store = unsafe { STREAMING_LOGS.as_mut().unwrap() };
    f(store)
}

static mut NEXT_HANDLE: usize = 1;

fn next_handle() -> usize {
    // SAFETY: WASM is single-threaded, so there is no data race on this
    // static counter. Handle values are monotonic and unique within a session.
    let handle = unsafe { NEXT_HANDLE };
    unsafe { NEXT_HANDLE += 1 };
    handle
}
''',
    '''use crate::probabilistic::streaming_log::StreamingLog;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

thread_local! {
    /// Per-thread store for StreamingLog instances. WASM executes on one thread;
    /// native test runners receive isolated stores without unsafe global aliases.
    static STREAMING_LOGS: RefCell<HashMap<usize, StreamingLog>> =
        RefCell::new(HashMap::new());
    static NEXT_HANDLE: Cell<usize> = const { Cell::new(1) };
}

fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<usize, StreamingLog>) -> R,
{
    STREAMING_LOGS.with(|store| {
        let mut store = store.borrow_mut();
        f(&mut store)
    })
}

fn next_handle() -> usize {
    NEXT_HANDLE.with(|next| {
        let handle = next.get();
        next.set(handle.checked_add(1).expect("StreamingLog handle space exhausted"));
        handle
    })
}
''',
)

changed = [membrane, registry]
subprocess.run(["rustfmt", *changed], cwd=ROOT, check=True)
subprocess.run(["git", "diff", "--check", "--", *changed], cwd=ROOT, check=True)
print("\n".join(changed))
