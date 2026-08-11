//! Emits the macOS `-undefined dynamic_lookup` linker arguments PyO3's
//! `extension-module` feature requires for a `cdylib` extension.
//!
//! PyO3's `extension-module` feature deliberately does not link `libpython`
//! (the symbols are supplied at `dlopen` time by the host Python interpreter
//! that loads this `.so`), but it does NOT emit the linker arguments needed
//! to tell the linker to defer those symbols to runtime — that's the
//! extension-module crate's own responsibility, per
//! `pyo3_build_config::add_extension_module_link_args`'s doc comment.
//! Without this build script, a plain `cargo build`/`cargo test` on this
//! crate fails to *link* on macOS with "symbol(s) not found for
//! architecture arm64" for CPython runtime symbols (`Py_InitializeEx`,
//! `_PyUnicode_Type`, etc.) that are real and always compiled into `pyo3`,
//! just never linked against libpython. `maturin build` (this crate's
//! primary packaging path) handles this separately at the tool level, which
//! is why the gap was invisible there — this build.rs is what makes plain
//! `cargo build -p wasm4pm-bindings-py` work too.
fn main() {
    pyo3_build_config::add_extension_module_link_args();
}
