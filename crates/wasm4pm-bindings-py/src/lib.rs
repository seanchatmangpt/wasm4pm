//! Native Python bindings for wasm4pm — mirrors the Rust/WASM export surface.

mod bridge;
mod exports_generated;

use pyo3::prelude::*;

#[pymodule]
fn _native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    exports_generated::register_exports(m)
}
