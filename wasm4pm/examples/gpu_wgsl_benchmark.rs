//! GPU WGSL benchmark stub.
//!
//! Full benchmarking of the LinUCB WGSL kernel requires a physical GPU and the
//! `wgpu` runtime.  This file exists so that `cargo check` and `cargo clippy`
//! can parse the manifest without error.  Execute only on hosts with
//! `--features gpu`.

fn main() {
    println!("GPU WGSL benchmark: run with --features gpu on a host with a discrete GPU.");
}
