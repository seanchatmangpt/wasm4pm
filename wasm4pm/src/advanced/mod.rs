pub mod alphappp;
pub mod wasm4auto;
pub mod oc_declare;
pub mod ocdfg;
pub mod ocla;

pub use alphappp::{discover_alpha_ppp, AlphaPPPConfig};
pub use oc_declare::{discover_oc_declare, OCDeclareOptions, OCDeclareRule, OCDeclareTemplate};
pub use ocdfg::OCDFG;
pub use ocla::OCLanguageAbstraction;

use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{to_js, to_js_str};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn discover_alpha_ppp_wasm(
    log_handle: &str,
    activity_key: &str,
    absolute_df_clean_thresh: usize,
    causal_threshold: f64,
) -> Result<JsValue, JsValue> {
    let config = AlphaPPPConfig {
        absolute_df_clean_thresh,
        causal_threshold,
    };
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let net = discover_alpha_ppp(log, config, activity_key);
            to_js_str(&net)
        }
        _ => Err(crate::error::wasm_err(
            crate::error::codes::INVALID_INPUT,
            "Object is not an EventLog",
        )),
    })
}

#[wasm_bindgen]
pub fn discover_ocdfg_wasm(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let ocdfg = OCDFG::discover(ocel);
            to_js(&ocdfg)
        }
        _ => Err(crate::error::wasm_err(
            crate::error::codes::INVALID_INPUT,
            "Object is not an OCEL",
        )),
    })
}

#[wasm_bindgen]
pub fn discover_ocla_wasm(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let ocla = OCLanguageAbstraction::create_from_ocel(ocel);
            to_js(&ocla)
        }
        _ => Err(crate::error::wasm_err(
            crate::error::codes::INVALID_INPUT,
            "Object is not an OCEL",
        )),
    })
}

#[wasm_bindgen]
pub fn discover_oc_declare_wasm(
    ocel_handle: &str,
    noise_threshold: f64,
) -> Result<JsValue, JsValue> {
    let options = OCDeclareOptions { noise_threshold };
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let rules = discover_oc_declare(ocel, options);
            to_js(&rules)
        }
        _ => Err(crate::error::wasm_err(
            crate::error::codes::INVALID_INPUT,
            "Object is not an OCEL",
        )),
    })
}
