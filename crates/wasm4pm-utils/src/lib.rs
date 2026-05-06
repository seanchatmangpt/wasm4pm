pub mod bitset;
use serde::Serialize;

#[cfg(target_arch = "wasm32")]
pub fn to_js_str<T: Serialize>(value: &T) -> Result<wasm_bindgen::JsValue, wasm_bindgen::JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))
}
#[cfg(test)]
mod dense_index_proptests;
pub mod dense_kernel;
pub mod math;
pub mod perturbation;
pub mod scc;
pub mod static_pkt;
#[cfg(test)]
pub mod static_pkt_tests;
