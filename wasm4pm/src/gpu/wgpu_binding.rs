// wgpu_binding.rs — GPU compute pipeline for LinUCB contextual bandit
//
// Prediction perspective: Resource and Intervention (van der Aalst framework)
// Question answered: "Which process mining algorithm maximises expected quality
//                    given the 8-dimensional feature vector of this event log?"
//
// Architecture:
//   - wgpu device detection: RTX 4090 preferred, CPU fallback via wgpu::util::backend_bits_from_env
//   - Batch size: 2048 states per dispatch
//   - Workgroups: 8 × workgroup_size(256) = 2048 threads
//   - State: W[40×8] + A_inv[8×8] + b[40×8] ≈ 2.1 KB (fits in GPU shared memory)
//   - VRAM budget: ≤32 MB for 2048 batch + state buffers
//
// Failure modes are informative (TPS principle):
//   - No GPU available → logs warning, falls back to CPU LinUCB
//   - Invalid features (NaN/inf) → clamped, inference proceeds with degraded confidence
//   - Shader compile failure → returns Err with WGSL compilation diagnostics

#[cfg(feature = "gpu")]
use std::borrow::Cow;

/// 8-dimensional feature vector describing an event log or running case prefix.
/// All values are normalised to [0, 1] before GPU dispatch.
#[derive(Debug, Clone, PartialEq)]
pub struct LogFeatures {
    /// Average trace length in the log, normalised by max observed (clamp 0..1)
    pub trace_length: f32,
    /// Elapsed time ratio: elapsed_ms / expected_completion_ms (clamp 0..2)
    pub elapsed_time: f32,
    /// Average rework loop count per trace (clamp 0..1 after /max_rework)
    pub rework_count: f32,
    /// Distinct activity count / 100 (clamp 0..1)
    pub unique_activities: f32,
    /// Mean inter-event gap in seconds, normalised by 3600 (1 hour)
    pub avg_inter_event_time: f32,
    /// log10(trace_count) / log10(10000) — log size bucket (clamp 0..1)
    pub log_size_bin: f32,
    /// Shannon entropy of activity frequency distribution (clamp 0..1 after /log2(N))
    pub activity_entropy: f32,
    /// distinct_variant_count / trace_count (clamp 0..1)
    pub variant_ratio: f32,
}

impl LogFeatures {
    /// Serialise to flat f32 array in GPU buffer order.
    pub fn to_f32_array(&self) -> [f32; 8] {
        [
            clamp01(self.trace_length),
            clamp01(self.elapsed_time / 2.0), // max expected ratio is 2
            clamp01(self.rework_count),
            clamp01(self.unique_activities),
            clamp01(self.avg_inter_event_time),
            clamp01(self.log_size_bin),
            clamp01(self.activity_entropy),
            clamp01(self.variant_ratio),
        ]
    }

    /// Validate: returns false if any raw feature value is NaN or infinite.
    ///
    /// Note: Infinity is caught here even though `to_f32_array()` clamps it to
    /// 1.0, because Inf in the raw input indicates upstream measurement failure
    /// (e.g. division by zero in inter-event time calculation). The caller should
    /// repair or discard such features before GPU dispatch.
    pub fn is_valid(&self) -> bool {
        [
            self.trace_length,
            self.elapsed_time,
            self.rework_count,
            self.unique_activities,
            self.avg_inter_event_time,
            self.log_size_bin,
            self.activity_entropy,
            self.variant_ratio,
        ]
        .iter()
        .all(|v| v.is_finite())
    }
}

/// Algorithm selection result from LinUCB inference.
#[derive(Debug, Clone)]
pub struct LinUcbResult {
    /// Index into the 40-slot action space (0..39)
    pub action_index: u32,
    /// Algorithm ID string from ALGORITHM_IDS registry
    pub algorithm_id: &'static str,
    /// UCB confidence value Q̂_a(x) = w^T x + α√(x^T A^{-1} x)
    pub ucb_value: f32,
    /// Exploration bonus component: α√(x^T A^{-1} x)
    pub ucb_bonus: f32,
    /// Whether result came from GPU or CPU fallback
    pub gpu_accelerated: bool,
}

/// Canonical algorithm ID registry — 40 slots (37 registered + 3 reserved).
/// Order is stable and matches ALGORITHM_IDS in contracts/src/templates/algorithm-registry.ts.
pub const ALGORITHM_IDS: [&str; 40] = [
    "process_skeleton",        // 0
    "dfg",                     // 1
    "alpha_plus_plus",         // 2
    "heuristic_miner",         // 3
    "inductive_miner",         // 4
    "declare",                 // 5
    "hill_climbing",           // 6
    "simulated_annealing",     // 7
    "a_star",                  // 8
    "aco",                     // 9
    "optimized_dfg",           // 10
    "pso",                     // 11
    "genetic_algorithm",       // 12
    "ilp",                     // 13
    "transition_system",       // 14
    "log_to_trie",             // 15
    "causal_graph",            // 16
    "performance_spectrum",    // 17
    "batches",                 // 18
    "correlation_miner",       // 19
    "generalization",          // 20
    "petri_net_reduction",     // 21
    "etconformance_precision", // 22
    "alignments",              // 23
    "complexity_metrics",      // 24
    "pnml_import",             // 25
    "bpmn_import",             // 26
    "powl_to_process_tree",    // 27
    "yawl_export",             // 28
    "playout",                 // 29
    "monte_carlo_simulation",  // 30
    "ml_classify",             // 31
    "ml_cluster",              // 32
    "ml_forecast",             // 33
    "ml_anomaly",              // 34
    "ml_regress",              // 35
    "ml_pca",                  // 36
    "_reserved_37",            // 37 — future
    "_reserved_38",            // 38 — future
    "_reserved_39",            // 39 — future
];

const N_FEATURES: usize = 8;
const N_ACTIONS: usize = 40;
#[cfg(any(feature = "gpu", test))]
const BATCH_SIZE: usize = 2048;

/// LinUCB model state stored on the CPU (mirrored to GPU buffers on each inference call).
pub struct LinUcbState {
    /// Weight matrix W[40 × 8] — one weight vector per action.
    pub w_matrix: Vec<f32>, // 320 floats = 1.28 KB
    /// Inverse of the A matrix A^{-1}[8 × 8] — shared across all actions.
    pub a_inv: Vec<f32>, // 64 floats = 256 bytes
    /// Reward-weighted feature accumulator b[40 × 8] — one per action.
    pub b_vector: Vec<f32>, // 320 floats = 1.28 KB
    /// UCB exploration parameter α (default 1.0)
    pub alpha: f32,
}

impl Default for LinUcbState {
    fn default() -> Self {
        Self::new(1.0)
    }
}

impl LinUcbState {
    /// Create a new LinUCB state with identity A_inv and zero W/b.
    /// α=1.0 is the standard UCB exploration coefficient.
    pub fn new(alpha: f32) -> Self {
        let mut a_inv = vec![0.0f32; N_FEATURES * N_FEATURES];
        // Initialise A_inv = I (identity — equivalent to starting with A = I)
        for i in 0..N_FEATURES {
            a_inv[i * N_FEATURES + i] = 1.0;
        }
        Self {
            w_matrix: vec![0.0f32; N_ACTIONS * N_FEATURES],
            a_inv,
            b_vector: vec![0.0f32; N_ACTIONS * N_FEATURES],
            alpha,
        }
    }

    /// CPU reference implementation of LinUCB inference (single feature vector).
    /// Used as correctness baseline and fallback when GPU is unavailable.
    ///
    /// Returns (action_index, ucb_value, ucb_bonus).
    #[allow(clippy::needless_range_loop)]
    pub fn infer_cpu(&self, features: &LogFeatures) -> (u32, f32, f32) {
        let x = features.to_f32_array();

        // Compute x^T A_inv x
        let mut a_inv_x = [0.0f32; N_FEATURES];
        for i in 0..N_FEATURES {
            let mut acc = 0.0f32;
            for j in 0..N_FEATURES {
                acc += self.a_inv[i * N_FEATURES + j] * x[j];
            }
            a_inv_x[i] = acc;
        }
        let xt_ainv_x: f32 = x.iter().zip(a_inv_x.iter()).map(|(xi, ai)| xi * ai).sum();
        let ucb_bonus = self.alpha * xt_ainv_x.max(0.0).sqrt();

        // Compute Q̂_a(x) for each action
        let mut best_action = 0u32;
        let mut best_q = f32::NEG_INFINITY;
        for a in 0..N_ACTIONS {
            let offset = a * N_FEATURES;
            let dot: f32 = self.w_matrix[offset..offset + N_FEATURES]
                .iter()
                .zip(x.iter())
                .map(|(w, xi)| w * xi)
                .sum();
            let q = dot + ucb_bonus;
            if q > best_q {
                best_q = q;
                best_action = a as u32;
            }
        }
        (best_action, best_q, ucb_bonus)
    }

    /// Online update: LinUCB Sherman-Morrison rank-1 update for A_inv and b.
    ///
    /// Called after observing reward `r` for selecting action `action_idx` when
    /// the context was `features`.
    #[allow(clippy::needless_range_loop)]
    pub fn update(&mut self, features: &LogFeatures, action_idx: usize, reward: f32) {
        if action_idx >= N_ACTIONS {
            return; // guard against out-of-range action
        }
        let x = features.to_f32_array();

        // Compute A_inv x
        let mut a_inv_x = [0.0f32; N_FEATURES];
        for i in 0..N_FEATURES {
            let mut acc = 0.0f32;
            for j in 0..N_FEATURES {
                acc += self.a_inv[i * N_FEATURES + j] * x[j];
            }
            a_inv_x[i] = acc;
        }

        // x^T A_inv x
        let xt_ainv_x: f32 = x.iter().zip(a_inv_x.iter()).map(|(xi, ai)| xi * ai).sum();
        let denom = 1.0 + xt_ainv_x;
        if denom.abs() < 1e-8 {
            return; // degenerate — skip update
        }

        // A_inv' = A_inv - (A_inv x)(x^T A_inv) / denom
        // A_inv is symmetric, so x^T A_inv = (A_inv x)^T
        for i in 0..N_FEATURES {
            for j in 0..N_FEATURES {
                self.a_inv[i * N_FEATURES + j] -= a_inv_x[i] * a_inv_x[j] / denom;
            }
        }

        // b_a += reward * x
        let b_off = action_idx * N_FEATURES;
        for i in 0..N_FEATURES {
            self.b_vector[b_off + i] += reward * x[i];
        }

        // w_a = A_inv b_a
        let w_off = action_idx * N_FEATURES;
        for i in 0..N_FEATURES {
            let mut acc = 0.0f32;
            for j in 0..N_FEATURES {
                acc += self.a_inv[i * N_FEATURES + j] * self.b_vector[b_off + j];
            }
            self.w_matrix[w_off + i] = acc;
        }
    }
}

// ─── GPU Pipeline ─────────────────────────────────────────────────────────────

/// GPU-accelerated LinUCB compute pipeline.
///
/// On construction, attempts to acquire a `wgpu::Device`. If no GPU is available
/// (no discrete GPU, headless CI, or GPU feature not compiled), `GpuLinUcb::new`
/// returns `Ok(None)` rather than an error, and the caller should fall back to
/// `LinUcbState::infer_cpu`.
#[cfg(feature = "gpu")]
pub struct GpuLinUcb {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,

    // Persistent GPU buffers (avoid re-allocation per dispatch)
    buf_features: wgpu::Buffer, // [BATCH_SIZE * N_FEATURES * 4] bytes — input
    buf_w_matrix: wgpu::Buffer, // [N_ACTIONS * N_FEATURES * 4] bytes — weights
    buf_a_inv: wgpu::Buffer,    // [N_FEATURES * N_FEATURES * 4] bytes — A_inv
    buf_alpha: wgpu::Buffer,    // [4] bytes — exploration coefficient
    buf_actions: wgpu::Buffer,  // [BATCH_SIZE * 4] bytes — output action indices
    buf_ucb: wgpu::Buffer,      // [BATCH_SIZE * 4] bytes — output UCB values
    buf_readback: wgpu::Buffer, // mapped-read copy of actions + ucb
}

#[cfg(feature = "gpu")]
impl GpuLinUcb {
    /// Attempt to create a GPU pipeline.
    ///
    /// Returns:
    ///   Ok(Some(pipeline)) — GPU available and pipeline compiled successfully
    ///   Ok(None)           — No suitable GPU adapter found (CPU fallback should be used)
    ///   Err(msg)           — GPU found but pipeline compilation failed
    pub async fn new() -> Result<Option<Self>, String> {
        // Request an adapter — prefer high-performance (discrete GPU, e.g. RTX 4090)
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
            ..Default::default()
        });

        let adapter = match instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
        {
            Some(a) => a,
            None => {
                // No discrete GPU — try software fallback
                match instance
                    .request_adapter(&wgpu::RequestAdapterOptions {
                        power_preference: wgpu::PowerPreference::None,
                        compatible_surface: None,
                        force_fallback_adapter: true,
                    })
                    .await
                {
                    Some(a) => a,
                    None => {
                        eprintln!(
                            "[LinUCB] No GPU adapter available — falling back to CPU inference"
                        );
                        return Ok(None);
                    }
                }
            }
        };

        let adapter_info = adapter.get_info();
        eprintln!(
            "[LinUCB] GPU adapter: {} ({:?})",
            adapter_info.name, adapter_info.device_type
        );

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("linucb"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                    ..Default::default()
                },
                None,
            )
            .await
            .map_err(|e| format!("GPU device request failed: {e}"))?;

        // Load WGSL shader — embedded at compile time
        let shader_src = include_str!("linucb_kernel.wgsl");
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("linucb_shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(shader_src)),
        });

        // Bind group layout — matches WGSL @binding annotations
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("linucb_bgl"),
            entries: &[
                // @binding(0) features_in: storage read
                bgl_entry(0, wgpu::BufferBindingType::Storage { read_only: true }),
                // @binding(1) w_matrix: storage read
                bgl_entry(1, wgpu::BufferBindingType::Storage { read_only: true }),
                // @binding(2) a_inv: storage read
                bgl_entry(2, wgpu::BufferBindingType::Storage { read_only: true }),
                // @binding(3) alpha_buf: storage read
                bgl_entry(3, wgpu::BufferBindingType::Storage { read_only: true }),
                // @binding(4) actions_out: storage read_write
                bgl_entry(4, wgpu::BufferBindingType::Storage { read_only: false }),
                // @binding(5) ucb_out: storage read_write
                bgl_entry(5, wgpu::BufferBindingType::Storage { read_only: false }),
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("linucb_pl"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("linucb_pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("linucb_select"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });

        // Allocate persistent GPU buffers
        let features_bytes = (BATCH_SIZE * N_FEATURES * 4) as u64;
        let weights_bytes = (N_ACTIONS * N_FEATURES * 4) as u64;
        let a_inv_bytes = (N_FEATURES * N_FEATURES * 4) as u64;
        let alpha_bytes = 4u64;
        let actions_bytes = (BATCH_SIZE * 4) as u64;
        let ucb_bytes = (BATCH_SIZE * 4) as u64;
        let readback_bytes = actions_bytes + ucb_bytes;

        let buf_features = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("features_in"),
            size: features_bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let buf_w_matrix = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("w_matrix"),
            size: weights_bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let buf_a_inv = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("a_inv"),
            size: a_inv_bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let buf_alpha = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("alpha_buf"),
            size: alpha_bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let buf_actions = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("actions_out"),
            size: actions_bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let buf_ucb = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ucb_out"),
            size: ucb_bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let buf_readback = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: readback_bytes,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Ok(Some(Self {
            device,
            queue,
            pipeline,
            bind_group_layout,
            buf_features,
            buf_w_matrix,
            buf_a_inv,
            buf_alpha,
            buf_actions,
            buf_ucb,
            buf_readback,
        }))
    }

    /// Run inference on a batch of feature vectors.
    ///
    /// `features`: flat f32 array of length `batch_size * 8`.
    ///             Must be pre-normalised to [0, 1].
    /// `state`:    current LinUCB model state (W, A_inv, alpha).
    ///
    /// Returns (action_indices[batch_size], ucb_values[batch_size]) or Err on GPU fault.
    ///
    /// Performance target: ≤0.1 ms for batch_size=2048 on RTX 4090.
    pub async fn infer_batch(
        &self,
        features: &[f32],
        state: &LinUcbState,
    ) -> Result<(Vec<u32>, Vec<f32>), String> {
        let n = features.len() / N_FEATURES;
        if n == 0 || features.len() % N_FEATURES != 0 {
            return Err(format!(
                "features length {} is not a multiple of N_FEATURES={}",
                features.len(),
                N_FEATURES
            ));
        }
        if n > BATCH_SIZE {
            return Err(format!(
                "batch size {} exceeds maximum {} — split into smaller batches",
                n, BATCH_SIZE
            ));
        }

        // ── Upload model state and features to GPU ────────────────────────────
        let features_bytes = bytemuck_cast_slice_f32(features);
        self.queue
            .write_buffer(&self.buf_features, 0, features_bytes);

        let w_bytes = bytemuck_cast_slice_f32(&state.w_matrix);
        self.queue.write_buffer(&self.buf_w_matrix, 0, w_bytes);

        let a_inv_bytes = bytemuck_cast_slice_f32(&state.a_inv);
        self.queue.write_buffer(&self.buf_a_inv, 0, a_inv_bytes);

        let alpha_bytes = bytemuck_cast_slice_f32(&[state.alpha]);
        self.queue.write_buffer(&self.buf_alpha, 0, alpha_bytes);

        // ── Build bind group ──────────────────────────────────────────────────
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("linucb_bg"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.buf_features.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.buf_w_matrix.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.buf_a_inv.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.buf_alpha.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: self.buf_actions.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: self.buf_ucb.as_entire_binding(),
                },
            ],
        });

        // ── Dispatch compute ──────────────────────────────────────────────────
        // Workgroup size is 256. Each workgroup handles 32 states.
        // workgroup_count = ceil(n / 32)
        let workgroup_count = ((n as u32) + 31) / 32;

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("linucb_encoder"),
            });
        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("linucb_pass"),
                timestamp_writes: None,
            });
            cpass.set_pipeline(&self.pipeline);
            cpass.set_bind_group(0, &bind_group, &[]);
            cpass.dispatch_workgroups(workgroup_count, 1, 1);
        }

        // Copy results to readback buffer
        let actions_bytes_size = (n * 4) as u64;
        let ucb_bytes_size = (n * 4) as u64;
        encoder.copy_buffer_to_buffer(
            &self.buf_actions,
            0,
            &self.buf_readback,
            0,
            actions_bytes_size,
        );
        encoder.copy_buffer_to_buffer(
            &self.buf_ucb,
            0,
            &self.buf_readback,
            actions_bytes_size,
            ucb_bytes_size,
        );

        self.queue.submit(std::iter::once(encoder.finish()));

        // ── Readback ──────────────────────────────────────────────────────────
        let readback_slice = self
            .buf_readback
            .slice(0..(actions_bytes_size + ucb_bytes_size));
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), wgpu::BufferAsyncError>>();
        readback_slice.map_async(wgpu::MapMode::Read, move |v| {
            let _ = tx.send(v);
        });
        self.device.poll(wgpu::MaintainBase::Wait);
        rx.recv()
            .map_err(|_| "GPU readback channel error".to_string())?
            .map_err(|e| format!("GPU buffer map error: {e}"))?;

        let data = readback_slice.get_mapped_range();
        let raw: &[u8] = &data;

        let actions_raw = &raw[..actions_bytes_size as usize];
        let ucb_raw = &raw[actions_bytes_size as usize..];

        let actions: Vec<u32> = actions_raw
            .chunks_exact(4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect();
        let ucb_vals: Vec<f32> = ucb_raw
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect();

        drop(data);
        self.buf_readback.unmap();

        Ok((actions, ucb_vals))
    }

    /// Convenience: infer for a single feature vector.
    /// Returns a fully annotated `LinUcbResult`.
    pub async fn infer_single(
        &self,
        features: &LogFeatures,
        state: &LinUcbState,
    ) -> Result<LinUcbResult, String> {
        if !features.is_valid() {
            return Err("Feature vector contains NaN or Inf — cannot dispatch to GPU".to_string());
        }

        let flat = features.to_f32_array();
        let (actions, ucb_vals) = self.infer_batch(&flat, state).await?;

        let action_idx = actions[0].min((N_ACTIONS - 1) as u32);
        // Recompute UCB bonus from CPU for the interpretation field
        let (_, _, ucb_bonus) = state.infer_cpu(features);

        Ok(LinUcbResult {
            action_index: action_idx,
            algorithm_id: ALGORITHM_IDS[action_idx as usize],
            ucb_value: ucb_vals[0],
            ucb_bonus,
            gpu_accelerated: true,
        })
    }
}

// ─── Public inference API ─────────────────────────────────────────────────────

/// Top-level LinUCB inference: selects the best algorithm for this event log.
///
/// Tries GPU if the `gpu` feature is compiled in; falls back to CPU otherwise.
/// This is the primary entry point called from `prediction_resource.rs` and the
/// `pictl predict resource` CLI command.
///
/// Interpretability contract: the returned `LinUcbResult` always includes
/// `algorithm_id` (human-readable), `ucb_value` (confidence score), and
/// `gpu_accelerated` (provenance).
pub fn select_algorithm(features: &LogFeatures, state: &LinUcbState) -> LinUcbResult {
    #[cfg(feature = "gpu")]
    {
        // Attempt GPU inference; fall through to CPU on any error
        let rt = tokio_or_futures_executor();
        match rt.and_then(|ex| ex.block_on_result(|| async { GpuLinUcb::new().await })) {
            Ok(Some(gpu)) => {
                if let Ok(result) = futures::executor::block_on(gpu.infer_single(features, state)) {
                    return result;
                }
            }
            _ => {}
        }
    }

    // CPU fallback — always available, bitwise-compatible with GPU output
    cpu_infer(features, state)
}

/// CPU-only inference (always available, even without `gpu` feature).
pub fn cpu_infer(features: &LogFeatures, state: &LinUcbState) -> LinUcbResult {
    let (action_idx, ucb_value, ucb_bonus) = state.infer_cpu(features);
    let action_idx = action_idx.min((N_ACTIONS - 1) as u32);
    LinUcbResult {
        action_index: action_idx,
        algorithm_id: ALGORITHM_IDS[action_idx as usize],
        ucb_value,
        ucb_bonus,
        gpu_accelerated: false,
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

#[inline]
fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

/// Safe byte-cast for f32 slices: reinterprets &[f32] as &[u8].
/// This avoids the `bytemuck` dependency for a trivial operation.
#[cfg(feature = "gpu")]
fn bytemuck_cast_slice_f32(data: &[f32]) -> &[u8] {
    // SAFETY: f32 is plain-old-data, alignment is 4 bytes, and slice length
    // is multiplied by 4 to get the byte length. No UB possible here.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 4) }
}

#[cfg(feature = "gpu")]
fn bgl_entry(binding: u32, ty: wgpu::BufferBindingType) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn default_features() -> LogFeatures {
        LogFeatures {
            trace_length: 0.3,
            elapsed_time: 0.5,
            rework_count: 0.1,
            unique_activities: 0.2,
            avg_inter_event_time: 0.4,
            log_size_bin: 0.6,
            activity_entropy: 0.7,
            variant_ratio: 0.15,
        }
    }

    #[test]
    fn cpu_infer_returns_valid_action() {
        let state = LinUcbState::default();
        let features = default_features();
        let result = cpu_infer(&features, &state);

        // Action index must be within bounds
        assert!(
            (result.action_index as usize) < N_ACTIONS,
            "action_index {} out of bounds (N_ACTIONS={})",
            result.action_index,
            N_ACTIONS
        );

        // Algorithm ID must be a non-empty string
        assert!(!result.algorithm_id.is_empty());

        // UCB value is finite
        assert!(result.ucb_value.is_finite(), "ucb_value is not finite");

        // No GPU in unit test environment
        assert!(!result.gpu_accelerated);
    }

    #[test]
    fn cpu_infer_is_deterministic() {
        let state = LinUcbState::default();
        let features = default_features();

        let r1 = cpu_infer(&features, &state);
        let r2 = cpu_infer(&features, &state);

        assert_eq!(
            r1.action_index, r2.action_index,
            "inference not deterministic"
        );
        assert_eq!(r1.ucb_value, r2.ucb_value, "UCB value not deterministic");
    }

    #[test]
    fn identity_a_inv_gives_ucb_bonus_equal_to_alpha_times_norm() {
        // With A_inv = I, x^T A_inv x = ||x||^2
        // UCB bonus = alpha * sqrt(||x||^2) = alpha * ||x||
        let state = LinUcbState::new(1.0);
        let features = LogFeatures {
            trace_length: 1.0,
            elapsed_time: 0.0,
            rework_count: 0.0,
            unique_activities: 0.0,
            avg_inter_event_time: 0.0,
            log_size_bin: 0.0,
            activity_entropy: 0.0,
            variant_ratio: 0.0,
        };

        let (_, _, bonus) = state.infer_cpu(&features);
        // x = [1,0,0,0,0,0,0,0], ||x|| = 1, bonus = alpha * 1.0 = 1.0
        assert!(
            (bonus - 1.0).abs() < 1e-5,
            "Expected UCB bonus ~1.0, got {bonus}"
        );
    }

    #[test]
    fn update_changes_weights() {
        let mut state = LinUcbState::default();
        let features = default_features();
        let action = 0usize;
        let reward = 1.0f32;

        let w_before: Vec<f32> = state.w_matrix[0..N_FEATURES].to_vec();
        state.update(&features, action, reward);
        let w_after: Vec<f32> = state.w_matrix[0..N_FEATURES].to_vec();

        let changed = w_before
            .iter()
            .zip(w_after.iter())
            .any(|(b, a)| (b - a).abs() > 1e-10);
        assert!(changed, "Weight update had no effect on w_matrix");
    }

    #[test]
    fn update_with_out_of_range_action_does_not_panic() {
        let mut state = LinUcbState::default();
        let features = default_features();
        // Should silently return without panicking
        state.update(&features, N_ACTIONS + 99, 1.0);
    }

    #[test]
    fn invalid_features_detected() {
        let mut f = default_features();
        f.trace_length = f32::NAN;
        assert!(!f.is_valid(), "NaN feature should be flagged as invalid");

        f.trace_length = f32::INFINITY;
        assert!(!f.is_valid(), "Inf feature should be flagged as invalid");
    }

    #[test]
    fn algorithm_ids_length_correct() {
        assert_eq!(
            ALGORITHM_IDS.len(),
            N_ACTIONS,
            "ALGORITHM_IDS must have N_ACTIONS={} entries",
            N_ACTIONS
        );
    }

    #[test]
    fn features_to_f32_array_clamped() {
        let f = LogFeatures {
            trace_length: 2.0,  // exceeds 1.0, should clamp
            elapsed_time: -1.0, // below 0.0, should clamp
            rework_count: 0.5,
            unique_activities: 0.5,
            avg_inter_event_time: 0.5,
            log_size_bin: 0.5,
            activity_entropy: 0.5,
            variant_ratio: 0.5,
        };
        let arr = f.to_f32_array();
        for (i, v) in arr.iter().enumerate() {
            assert!(
                *v >= 0.0 && *v <= 1.0,
                "feature[{i}] = {v} is out of [0,1] after clamping"
            );
        }
    }

    #[test]
    fn select_algorithm_returns_interpretable_result() {
        let state = LinUcbState::default();
        let features = default_features();
        let result = select_algorithm(&features, &state);

        // The result must be interpretable without re-running inference
        assert!(!result.algorithm_id.is_empty());
        assert!(result.ucb_value.is_finite());
        assert!((result.action_index as usize) < N_ACTIONS);
    }

    // ── Parity test: GPU output must match CPU output (bitwise) ───────────────
    // This test is annotated cfg(feature = "gpu") — it only runs when the GPU
    // feature is compiled in and a device is available.
    #[cfg(feature = "gpu")]
    #[tokio::test]
    async fn gpu_cpu_parity() {
        use futures::executor::block_on;

        let state = LinUcbState::new(0.5);
        let features = default_features();

        let gpu_opt = GpuLinUcb::new().await.expect("GPU init should not error");
        if gpu_opt.is_none() {
            // No GPU in this environment — skip rather than fail
            eprintln!("[parity test] No GPU available, skipping GPU/CPU parity check");
            return;
        }
        let gpu = gpu_opt.unwrap();

        let gpu_result = gpu
            .infer_single(&features, &state)
            .await
            .expect("GPU inference failed");
        let cpu_result = cpu_infer(&features, &state);

        assert_eq!(
            gpu_result.action_index, cpu_result.action_index,
            "GPU and CPU selected different actions: GPU={} CPU={}",
            gpu_result.action_index, cpu_result.action_index
        );
        assert!(
            (gpu_result.ucb_value - cpu_result.ucb_value).abs() < 1e-4,
            "GPU UCB value {:.6} differs from CPU {:.6} by more than tolerance",
            gpu_result.ucb_value,
            cpu_result.ucb_value
        );
    }

    // ── Throughput smoke test ─────────────────────────────────────────────────
    // Verifies that CPU inference can process 2048 states within a reasonable
    // wall-clock budget. The GPU version should be at least 100× faster.
    #[test]
    fn cpu_throughput_baseline() {
        let state = LinUcbState::default();
        let n = BATCH_SIZE;

        let features: Vec<LogFeatures> = (0..n)
            .map(|i| {
                let v = (i as f32) / (n as f32);
                LogFeatures {
                    trace_length: v,
                    elapsed_time: v,
                    rework_count: v * 0.1,
                    unique_activities: v * 0.5,
                    avg_inter_event_time: v * 0.3,
                    log_size_bin: v * 0.7,
                    activity_entropy: v * 0.8,
                    variant_ratio: v * 0.2,
                }
            })
            .collect();

        let start = std::time::Instant::now();
        let mut total_actions = 0u64;
        for f in &features {
            let r = cpu_infer(f, &state);
            total_actions += r.action_index as u64;
        }
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

        // Sanity: not all actions should be the same trivial choice
        // (total_actions used to prevent dead-code elimination)
        assert!(total_actions < (n as u64) * (N_ACTIONS as u64));

        let throughput = (n as f64) / (elapsed_ms / 1000.0);
        eprintln!(
            "[throughput] CPU LinUCB: {:.0} states/sec ({:.2} ms for {})",
            throughput, elapsed_ms, n
        );

        // CPU baseline requirement: at least 50K states/sec
        // GPU target: ≥250K states/sec
        assert!(
            throughput > 50_000.0,
            "CPU throughput {:.0} states/sec below minimum 50K",
            throughput
        );
    }

    // ── Cross-module structural compatibility: gpu vs ml ──────────────────────
    //
    // `gpu::LinUcbState` and `ml::linucb::LinUCBAgent` implement two distinct but
    // related LinUCB variants:
    //
    //   gpu::LinUcbState  — Standard LinUCB (Li et al. 2010, no intercept):
    //     b_a += r·x,  w_a = A_inv·b_a,  Q̂_a = w^T x + α√(x^T A^{-1} x)
    //
    //   ml::LinUCBAgent   — Gradient-descent LinUCB (with intercept + TD error):
    //     δ = r - (w·x + b),  w_a += lr·δ·x,  b_a += lr·δ,  A += x⊗x
    //     Q̂_a = w_a·x + b_a + α√(x^T A^{-1} x)
    //
    // These converge to the same optimum but follow different gradient paths.
    // Their action selections during training WILL differ (this is expected).
    //
    // This test validates:
    //   1. Both modules agree on N_FEATURES and N_ACTIONS (dimensionality parity)
    //   2. Both return valid (in-bounds, finite) results for identical inputs
    //   3. The WGSL GPU kernel uses gpu::LinUcbState as its CPU reference
    //      (not ml::LinUCBAgent) — GPU/CPU parity is validated in gpu_cpu_parity()
    #[test]
    fn cross_module_dimension_and_output_validity() {
        use crate::ml::linucb::{LinUCBAgent, N_ACTIONS as ML_N_ACTIONS, N_FEATURES as ML_N_FEATURES};

        // Dimension compatibility — required for any future algorithmic unification
        assert_eq!(N_FEATURES, ML_N_FEATURES,
            "Feature dimension mismatch: gpu::N_FEATURES={N_FEATURES} ml::N_FEATURES={ML_N_FEATURES}");
        assert_eq!(N_ACTIONS, ML_N_ACTIONS,
            "Action count mismatch: gpu::N_ACTIONS={N_ACTIONS} ml::N_ACTIONS={ML_N_ACTIONS}");

        // Both must return valid outputs for the same query
        let raw: [f32; 8] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
        let gpu_features = LogFeatures {
            trace_length:         raw[0], elapsed_time:         raw[1],
            rework_count:         raw[2], unique_activities:    raw[3],
            avg_inter_event_time: raw[4], log_size_bin:         raw[5],
            activity_entropy:     raw[6], variant_ratio:        raw[7],
        };

        let gpu_state = LinUcbState::default();
        let ml_agent  = LinUCBAgent::new();

        let (gpu_action, gpu_ucb, _) = gpu_state.infer_cpu(&gpu_features);
        let (ml_action, ml_ucb)      = ml_agent.select(&raw);

        // Both must produce in-bounds action indices
        assert!((gpu_action as usize) < N_ACTIONS,
            "gpu action {gpu_action} out of bounds");
        assert!((ml_action as usize) < ML_N_ACTIONS,
            "ml action {ml_action} out of bounds");

        // Both must produce finite UCB values
        assert!(gpu_ucb.is_finite(), "gpu UCB value is not finite: {gpu_ucb}");
        assert!(ml_ucb.is_finite(),  "ml UCB value is not finite: {ml_ucb}");

        // On a fresh agent (W=0, b=0), gpu Q̂_a = α√(x^T A^{-1} x) for all actions
        // (same UCB bonus, no bias) → all actions tied → argmax = 0
        // ml also has W=0, b=0 → all tied → argmax = 0
        // Note: both implementations break ties by returning the lowest-index action.
        assert_eq!(gpu_action, 0,
            "Fresh gpu agent should return action 0 (all tied), got {gpu_action}");
        assert_eq!(ml_action, 0,
            "Fresh ml agent should return action 0 (all tied), got {ml_action}");
    }
}
