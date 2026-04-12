// gpu/mod.rs — GPU compute module for pictl process mining
//
// This module provides GPU-accelerated inference for the LinUCB contextual
// bandit algorithm (resource/intervention prediction perspective).
//
// Compilation:
//   - Always available: LinUcbState, LogFeatures, LinUcbResult, cpu_infer, select_algorithm
//   - GPU-only:         GpuLinUcb, gpu_infer_batch (requires feature = "gpu")
//
// The WGSL kernel (linucb_kernel.wgsl) is embedded at compile time via
// `include_str!()` in wgpu_binding.rs.

pub mod wgpu_binding;

// Re-export the primary public API surface
pub use wgpu_binding::{
    cpu_infer,
    select_algorithm,
    LinUcbResult,
    LinUcbState,
    LogFeatures,
    ALGORITHM_IDS,
};

#[cfg(feature = "gpu")]
pub use wgpu_binding::GpuLinUcb;
