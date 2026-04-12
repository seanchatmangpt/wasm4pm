//! GPU WGSL Kernel Validation Tests — Agent 14
//!
//! Perspective: Resource and Intervention (van der Aalst prediction framework)
//! Question:    "Is the LinUCB WGSL kernel syntactically and semantically correct?"
//!
//! Chicago TDD — RED-GREEN-REFACTOR:
//!   RED:   Tests written before kernel was fixed (thread_local keyword bug)
//!   GREEN: Kernel fixed (thread_local → tid), all tests pass
//!
//! Test coverage:
//!   1. WGSL parses without error via naga
//!   2. WGSL validates (type-check, memory safety) via naga
//!   3. Entry point count = 2 (linucb_select + linucb_update)
//!   4. workgroup_size[0] = 256 for compute entry point
//!   5. Buffer binding count = 11 (6 select + 5 update)
//!   6. VRAM estimate ≤ 32 MB for batch=2048
//!   7. CPU LinUCB determinism: two independent runs produce identical actions
//!   8. CPU LinUCB throughput ≥ 250K states/sec (optimized build)
//!   9. CPU LinUCB action bounds: all actions ∈ [0, 39]
//!  10. CPU LinUCB convergence: rewarded action becomes argmax after training
//!  11. WGSL source does not contain the reserved keyword "thread_local"

use naga::front::wgsl;
use naga::valid::{Capabilities, ValidationFlags, Validator};
use pictl::ml::linucb::{LinUCBAgent, N_ACTIONS, N_FEATURES};
use std::time::Instant;

// Path to the WGSL kernel source
const WGSL_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/gpu/linucb_kernel.wgsl");

const BATCH_SIZE: usize = 2048;

// ─── WGSL Syntax & Type Tests ─────────────────────────────────────────────────

#[test]
fn wgsl_kernel_parses_without_error() {
    let source = std::fs::read_to_string(WGSL_PATH)
        .expect("WGSL kernel file must exist at src/gpu/linucb_kernel.wgsl");
    let result = wgsl::parse_str(&source);
    assert!(result.is_ok(), "WGSL parse failed: {}", result.unwrap_err());
}

#[test]
fn wgsl_kernel_validates_without_error() {
    let source = std::fs::read_to_string(WGSL_PATH).expect("WGSL kernel file must exist");
    let module = wgsl::parse_str(&source).expect("WGSL must parse before validation");
    let mut validator = Validator::new(ValidationFlags::all(), Capabilities::empty());
    let result = validator.validate(&module);
    assert!(
        result.is_ok(),
        "WGSL validation failed: {}",
        result.unwrap_err()
    );
}

#[test]
fn wgsl_kernel_has_two_entry_points() {
    let source = std::fs::read_to_string(WGSL_PATH).expect("WGSL kernel file must exist");
    let module = wgsl::parse_str(&source).expect("must parse");
    assert_eq!(
        module.entry_points.len(),
        2,
        "Expected 2 entry points (linucb_select + linucb_update), got {}",
        module.entry_points.len()
    );
}

#[test]
fn wgsl_kernel_workgroup_size_is_256() {
    let source = std::fs::read_to_string(WGSL_PATH).expect("WGSL kernel file must exist");
    let module = wgsl::parse_str(&source).expect("must parse");
    let compute_ep = module
        .entry_points
        .iter()
        .find(|ep| ep.stage == naga::ShaderStage::Compute)
        .expect("Must have at least one compute entry point");
    assert_eq!(
        compute_ep.workgroup_size[0], 256,
        "workgroup_size[0] must be 256, got {}",
        compute_ep.workgroup_size[0]
    );
}

#[test]
fn wgsl_kernel_has_expected_buffer_bindings() {
    let source = std::fs::read_to_string(WGSL_PATH).expect("WGSL kernel file must exist");
    let module = wgsl::parse_str(&source).expect("must parse");
    let binding_count = module
        .global_variables
        .iter()
        .filter(|(_, v)| v.binding.is_some())
        .count();
    // 6 bindings in linucb_select (@group(0)) + 5 in linucb_update (@group(1))
    assert_eq!(
        binding_count, 11,
        "Expected 11 buffer bindings (6 select + 5 update), got {binding_count}"
    );
}

#[test]
fn wgsl_kernel_vram_estimate_within_32mb() {
    // Buffer sizes for batch=2048, features=8, actions=40
    let vram_bytes: usize = (BATCH_SIZE * N_FEATURES * 4)
        + (N_ACTIONS * N_FEATURES * 4)
        + (N_FEATURES * N_FEATURES * 4)
        + 4
        + (BATCH_SIZE * 4)
        + (BATCH_SIZE * 4);
    // Add 10% overhead
    let total_mb = (vram_bytes as f64 * 1.10) / (1024.0 * 1024.0);
    assert!(
        total_mb <= 32.0,
        "VRAM estimate {total_mb:.3} MB exceeds 32 MB limit"
    );
}

#[test]
fn wgsl_kernel_does_not_use_reserved_keyword_thread_local() {
    let source = std::fs::read_to_string(WGSL_PATH).expect("WGSL kernel file must exist");
    // Scan for the identifier `thread_local` appearing as a WGSL variable binding
    // (not inside a comment). A simple line scan suffices since the reserved keyword
    // `thread_local` only appears in variable declarations, not comments.
    for (line_no, line) in source.lines().enumerate() {
        // Skip comment lines
        let code_part = if let Some(pos) = line.find("//") {
            &line[..pos]
        } else {
            line
        };
        assert!(
            !code_part.contains("thread_local"),
            "Line {}: WGSL code uses reserved keyword 'thread_local': {}",
            line_no + 1,
            line
        );
    }
}

// ─── CPU LinUCB Reference Tests ───────────────────────────────────────────────

#[test]
fn cpu_linucb_batch_is_deterministic() {
    let agent = LinUCBAgent::new();
    let mut state: u64 = 0xDEADBEEFCAFEBABE_u64;
    let batch: Vec<[f32; N_FEATURES]> = (0..BATCH_SIZE)
        .map(|_| {
            let mut features = [0.0_f32; N_FEATURES];
            for f in features.iter_mut() {
                state = state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                *f = (state >> 33) as f32 / u32::MAX as f32;
            }
            features
        })
        .collect();

    let run1: Vec<u32> = batch.iter().map(|f| agent.select(f).0).collect();
    let run2: Vec<u32> = batch.iter().map(|f| agent.select(f).0).collect();

    assert_eq!(
        run1, run2,
        "CPU LinUCB must produce identical actions on two independent runs"
    );
}

#[test]
fn cpu_linucb_actions_within_valid_range() {
    let agent = LinUCBAgent::new();
    let mut state: u64 = 0x1234567890ABCDEF_u64;
    let batch: Vec<[f32; N_FEATURES]> = (0..BATCH_SIZE)
        .map(|_| {
            let mut features = [0.0_f32; N_FEATURES];
            for f in features.iter_mut() {
                state = state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                *f = (state >> 33) as f32 / u32::MAX as f32;
            }
            features
        })
        .collect();

    for (i, features) in batch.iter().enumerate() {
        let (action, _) = agent.select(features);
        assert!(
            (action as usize) < N_ACTIONS,
            "State {i}: action {action} out of range [0, {N_ACTIONS})"
        );
    }
}

#[test]
fn cpu_linucb_throughput_exceeds_250k_states_per_sec() {
    // This test only provides a meaningful measurement in optimized builds.
    // In debug builds the throughput will be lower, but the test still verifies
    // the algorithm executes to completion without error.
    let agent = LinUCBAgent::new();
    let mut state: u64 = 0xFEEDFACEDEADBEEF_u64;
    let batch: Vec<[f32; N_FEATURES]> = (0..BATCH_SIZE)
        .map(|_| {
            let mut features = [0.0_f32; N_FEATURES];
            for f in features.iter_mut() {
                state = state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                *f = (state >> 33) as f32 / u32::MAX as f32;
            }
            features
        })
        .collect();

    // Warm-up
    for features in batch.iter() {
        let _ = agent.select(features);
    }

    let t0 = Instant::now();
    let runs = 10usize;
    for _ in 0..runs {
        for features in batch.iter() {
            let _ = agent.select(features);
        }
    }
    let elapsed_sec = t0.elapsed().as_secs_f64();
    let total_states = (BATCH_SIZE * runs) as f64;
    let throughput = total_states / elapsed_sec;

    assert!(
        throughput >= 250_000.0,
        "CPU LinUCB throughput {throughput:.0} states/sec below 250K minimum"
    );
}

#[test]
fn cpu_linucb_converges_to_rewarded_action() {
    let mut agent = LinUCBAgent::new();
    let features: [f32; N_FEATURES] = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];
    // Reward action 7 repeatedly — should become argmax
    for _ in 0..500 {
        agent.update(&features, 7, 1.0);
    }
    let (best, _) = agent.select(&features);
    assert_eq!(
        best, 7,
        "After 500 positive rewards for action 7, argmax should be 7, got {best}"
    );
}
