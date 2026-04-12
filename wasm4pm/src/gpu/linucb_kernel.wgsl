// LinUCB Contextual Bandit Kernel for Process Mining Algorithm Selection
//
// Perspective: Resource and Intervention (van der Aalst prediction framework)
// Question: "Which algorithm should handle this process mining task?"
//
// State: 8 log-characteristic features per case prefix
//   [0] trace_length          — average trace length in log
//   [1] elapsed_time          — normalised elapsed time ratio
//   [2] rework_count          — average rework loop count
//   [3] unique_activities     — number of distinct activities (normalised /100)
//   [4] avg_inter_event_time  — average time between events (normalised)
//   [5] log_size_bin          — log(trace_count) / log(10000)
//   [6] activity_entropy      — Shannon entropy of activity distribution
//   [7] variant_ratio         — distinct variants / trace_count
//
// Action space: 40 algorithm slots (37 registered + 3 reserved for future)
//
// LinUCB formula per action a:
//   Q̂_a(x) = w_a^T x + alpha * sqrt(x^T A_inv x)
//
// GPU layout:
//   workgroup_size(256): 256 threads per workgroup
//   batch_size: 2048 states per dispatch
//   workgroups: 8 (2048 / 256 = 8 concurrent workgroups)
//
// Buffer bindings:
//   @group(0) @binding(0) features_in  : array<f32>  [batch * 8]
//   @group(0) @binding(1) w_matrix     : array<f32>  [40 * 8]
//   @group(0) @binding(2) a_inv        : array<f32>  [8 * 8]
//   @group(0) @binding(3) alpha_buf    : array<f32>  [1] — UCB exploration parameter
//   @group(0) @binding(4) actions_out  : array<u32>  [batch] — selected action indices
//   @group(0) @binding(5) ucb_out      : array<f32>  [batch] — UCB confidence values

// ─── Constants ────────────────────────────────────────────────────────────────

const N_FEATURES: u32 = 8u;
const N_ACTIONS: u32  = 40u;
const BATCH_SIZE: u32 = 2048u;

// ─── Bindings ─────────────────────────────────────────────────────────────────

@group(0) @binding(0) var<storage, read>       features_in : array<f32>;  // [batch * 8]
@group(0) @binding(1) var<storage, read>       w_matrix    : array<f32>;  // [40 * 8]
@group(0) @binding(2) var<storage, read>       a_inv       : array<f32>;  // [8 * 8]
@group(0) @binding(3) var<storage, read>       alpha_buf   : array<f32>;  // [1]
@group(0) @binding(4) var<storage, read_write> actions_out : array<u32>;  // [batch]
@group(0) @binding(5) var<storage, read_write> ucb_out     : array<f32>;  // [batch]

// ─── Shared memory ────────────────────────────────────────────────────────────
// 256-thread workgroup: each thread loads one element of the 8-feature vector
// for its assigned state. We process multiple states per workgroup to fill all 256 threads.
// Layout: 32 states × 8 features = 256 slots.

var<workgroup> shmem_features: array<f32, 256>;  // 32 states × 8 features

// ─── Entry point ──────────────────────────────────────────────────────────────
//
// Thread assignment:
//   global_id.x ∈ [0, batch_size)   — one thread per (state, feature) slot within workgroup
//   local_id.x  ∈ [0, 256)          — thread index within workgroup
//   workgroup_id.x ∈ [0, 8)         — workgroup index (8 workgroups for 2048 states)
//
// Within each workgroup (256 threads, 32 states):
//   thread_local = local_id.x
//   state_within_wg = thread_local / 8   ∈ [0, 32)
//   feature_idx     = thread_local % 8   ∈ [0, 8)

@compute @workgroup_size(256)
fn linucb_select(
    @builtin(global_invocation_id)   global_id    : vec3<u32>,
    @builtin(local_invocation_id)    local_id     : vec3<u32>,
    @builtin(workgroup_id)           workgroup_id : vec3<u32>,
) {
    let thread_local: u32 = local_id.x;
    let state_within_wg: u32 = thread_local / N_FEATURES;
    let feature_idx: u32    = thread_local % N_FEATURES;

    // Global state index = workgroup base + state within workgroup
    let wg_state_base: u32 = workgroup_id.x * 32u;
    let state_idx: u32     = wg_state_base + state_within_wg;

    // Guard: don't access out-of-bounds states
    if state_idx >= BATCH_SIZE {
        return;
    }

    // ── Phase 1: Load features into shared memory ────────────────────────────
    // Each thread loads exactly one feature for one state.
    let global_feat_idx: u32 = state_idx * N_FEATURES + feature_idx;
    shmem_features[thread_local] = features_in[global_feat_idx];

    // Synchronise: all 256 threads in workgroup must finish loading
    workgroupBarrier();

    // ── Phase 2: Compute Q̂_a(x) for all 40 actions ──────────────────────────
    // Only the first thread of each state group (feature_idx == 0) does the
    // full dot-product and argmax. This avoids 8× redundant computation.
    if feature_idx != 0u {
        return;
    }

    // Load feature vector from shared memory for this state
    let shmem_base: u32 = state_within_wg * N_FEATURES;

    var x: array<f32, 8>;
    for (var f: u32 = 0u; f < N_FEATURES; f++) {
        x[f] = shmem_features[shmem_base + f];
    }

    // Compute x^T A_inv x  (scalar — UCB confidence width)
    // A_inv is [8 × 8], row-major.
    var a_inv_x: array<f32, 8>;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        var acc: f32 = 0.0;
        for (var j: u32 = 0u; j < N_FEATURES; j++) {
            acc += a_inv[i * N_FEATURES + j] * x[j];
        }
        a_inv_x[i] = acc;
    }

    var xT_Ainv_x: f32 = 0.0;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        xT_Ainv_x += x[i] * a_inv_x[i];
    }

    // Guard against floating-point instability: clamp to [0, ∞)
    xT_Ainv_x = max(xT_Ainv_x, 0.0);

    let alpha: f32         = alpha_buf[0];
    let ucb_bonus: f32     = alpha * sqrt(xT_Ainv_x);

    // ── Phase 3: dot product W·x per action + UCB bonus → argmax ────────────
    // W is [40 × 8], row-major: w_matrix[a * 8 + f] = weight for action a, feature f.

    var best_action: u32 = 0u;
    var best_q: f32      = -3.4028235e+38;  // -f32::MAX

    for (var a: u32 = 0u; a < N_ACTIONS; a++) {
        var dot: f32 = 0.0;
        for (var f: u32 = 0u; f < N_FEATURES; f++) {
            dot += w_matrix[a * N_FEATURES + f] * x[f];
        }
        let q: f32 = dot + ucb_bonus;
        if q > best_q {
            best_q      = q;
            best_action = a;
        }
    }

    // ── Phase 4: Write results ────────────────────────────────────────────────
    actions_out[state_idx] = best_action;
    ucb_out[state_idx]     = best_q;
}

// ─── Weight Update Kernel ─────────────────────────────────────────────────────
//
// Online LinUCB update after observing reward r for action a on feature vector x:
//   A += x x^T                  (outer product update to A — we update A_inv via SMW)
//   b_a += r * x                (reward-weighted feature accumulation)
//   w_a = A_inv b_a             (recompute weights)
//
// Simplified rank-1 Sherman-Morrison-Woodbury for A_inv update:
//   A_inv' = A_inv - (A_inv x x^T A_inv) / (1 + x^T A_inv x)
//
// Bindings for update kernel:
//   @group(0) @binding(0) x_feature    : array<f32>  [8]     — feature vector
//   @group(0) @binding(1) w_matrix_rw  : array<f32>  [40*8]  — weights (read-write)
//   @group(0) @binding(2) a_inv_rw     : array<f32>  [8*8]   — A_inv (read-write)
//   @group(0) @binding(3) b_vector_rw  : array<f32>  [40*8]  — b vectors (read-write)
//   @group(0) @binding(4) update_params: array<f32>  [3]     — [action_idx, reward, alpha]

@group(1) @binding(0) var<storage, read>       x_feature     : array<f32>;  // [8]
@group(1) @binding(1) var<storage, read_write> w_matrix_rw   : array<f32>;  // [40*8]
@group(1) @binding(2) var<storage, read_write> a_inv_rw      : array<f32>;  // [8*8]
@group(1) @binding(3) var<storage, read_write> b_vector_rw   : array<f32>;  // [40*8]
@group(1) @binding(4) var<storage, read>       update_params : array<f32>;  // [action_idx_f32, reward, alpha]

@compute @workgroup_size(64)
fn linucb_update(
    @builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(local_invocation_id)  local_id  : vec3<u32>,
) {
    // Only execute on thread 0 — update is serial over the 8×8 A_inv matrix.
    // Parallelism is achieved across the batch dimension (one dispatch per batch element).
    if global_id.x != 0u {
        return;
    }

    let action_idx: u32 = u32(update_params[0]);
    let reward: f32     = update_params[1];

    // Guard: invalid action index
    if action_idx >= N_ACTIONS {
        return;
    }

    // Load x
    var x: array<f32, 8>;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        x[i] = x_feature[i];
    }

    // ── Step 1: Compute A_inv x ───────────────────────────────────────────────
    var a_inv_x: array<f32, 8>;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        var acc: f32 = 0.0;
        for (var j: u32 = 0u; j < N_FEATURES; j++) {
            acc += a_inv_rw[i * N_FEATURES + j] * x[j];
        }
        a_inv_x[i] = acc;
    }

    // ── Step 2: Compute x^T A_inv x ──────────────────────────────────────────
    var xT_Ainv_x: f32 = 0.0;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        xT_Ainv_x += x[i] * a_inv_x[i];
    }

    // ── Step 3: Sherman-Morrison rank-1 update of A_inv ───────────────────────
    // A_inv' = A_inv - (A_inv x)(x^T A_inv) / (1 + x^T A_inv x)
    let denom: f32 = 1.0 + xT_Ainv_x;
    // Avoid division by zero (degenerate case)
    if abs(denom) < 1e-8 {
        return;
    }

    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        for (var j: u32 = 0u; j < N_FEATURES; j++) {
            // outer product term: (A_inv x)[i] * (x^T A_inv)[j]
            // Note: x^T A_inv = (A_inv x)^T since A_inv is symmetric
            let outer: f32 = a_inv_x[i] * a_inv_x[j];
            a_inv_rw[i * N_FEATURES + j] -= outer / denom;
        }
    }

    // ── Step 4: Update b_a += reward * x ─────────────────────────────────────
    let b_offset: u32 = action_idx * N_FEATURES;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        b_vector_rw[b_offset + i] += reward * x[i];
    }

    // ── Step 5: Recompute w_a = A_inv b_a ────────────────────────────────────
    let w_offset: u32 = action_idx * N_FEATURES;
    for (var i: u32 = 0u; i < N_FEATURES; i++) {
        var acc: f32 = 0.0;
        for (var j: u32 = 0u; j < N_FEATURES; j++) {
            acc += a_inv_rw[i * N_FEATURES + j] * b_vector_rw[b_offset + j];
        }
        w_matrix_rw[w_offset + i] = acc;
    }
}
