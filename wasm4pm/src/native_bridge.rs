//! Thread-local capture of JSON payloads on native (non-wasm32) targets.
//!
//! `wasm_bindgen` exports use `js_val` / `to_js` / `to_js_str` which discard
//! serialized strings on native hosts. Python bindings and other native callers
//! retrieve the last payload via [`take_native_json`].

use std::cell::RefCell;

thread_local! {
    static NATIVE_JSON: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Store a JSON string for native host retrieval (Python bindings, tests).
#[inline]
pub fn store_native_json(s: impl Into<String>) {
    #[cfg(not(target_arch = "wasm32"))]
    {
        NATIVE_JSON.with(|slot| *slot.borrow_mut() = Some(s.into()));
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = s;
    }
}

/// Take the last stored JSON string, if any.
#[inline]
pub fn take_native_json() -> Option<String> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        NATIVE_JSON.with(|slot| slot.borrow_mut().take())
    }
    #[cfg(target_arch = "wasm32")]
    {
        None
    }
}

/// Clear any pending native JSON without consuming it.
#[inline]
pub fn clear_native_json() {
    #[cfg(not(target_arch = "wasm32"))]
    {
        NATIVE_JSON.with(|slot| *slot.borrow_mut() = None);
    }
}
