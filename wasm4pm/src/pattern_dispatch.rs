// Ported from knhk/rust/knhk-kernel/src/pattern.rs
// 43-Pattern Dispatch Table for W3C workflow patterns (van der Aalst categorization)
// WASM-compatible: uses std::collections::HashMap, std::sync::atomic::AtomicU32
// Kept unsafe get_unchecked for hot-path indexing (valid in WASM)

use std::sync::atomic::{AtomicU32, Ordering};

/// Lightweight tick counter for WASM environments.
/// Replaces knhk's `crate::timer::HotPathTimer`.
#[inline(always)]
fn tick_start() -> u64 {
    // In WASM without high-precision timers, use a simple monotonic approximation.
    // The knhk original used a HotPathTimer; here we return 0 as a baseline
    // and let elapsed_ticks report 1 (minimum cost).
    0
}

#[inline(always)]
fn elapsed_ticks(start: u64) -> u64 {
    // WASM-safe: always report 1 tick minimum (represents ~1 operation)
    // In knhk this was timer.elapsed_ticks(); here we approximate.
    let _ = start;
    1
}

/// All 43 W3C workflow patterns (van der Aalst categorization)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum PatternType {
    // Basic Control Flow Patterns (1-5)
    Sequence = 1,
    ParallelSplit = 2,
    Synchronization = 3,
    ExclusiveChoice = 4,
    SimpleMerge = 5,

    // Advanced Branching and Synchronization (6-9)
    MultiChoice = 6,
    StructuredSyncMerge = 7,
    MultiMerge = 8,
    StructuredDiscriminator = 9,

    // Multiple Instance Patterns (10-15)
    MultiInstanceNoSync = 10,
    MultiInstanceKnownDesignTime = 11,
    MultiInstanceKnownRuntime = 12,
    MultiInstanceUnknownRuntime = 13,
    StaticPartialJoin = 14,
    CancellationPartialJoin = 15,

    // State-based Patterns (16-20)
    DeferredChoice = 16,
    InterleavedParallelRouting = 17,
    Milestone = 18,
    CriticalSection = 19,
    InterleavedRouting = 20,

    // Cancellation and Force Completion (21-25)
    CancelTask = 21,
    CancelCase = 22,
    CancelRegion = 23,
    CancelMultipleInstance = 24,
    CompleteMultipleInstance = 25,

    // Iteration Patterns (26-28)
    ArbitraryLoop = 26,
    StructuredLoop = 27,
    Recursion = 28,

    // Termination Patterns (29-31)
    ImplicitTermination = 29,
    ExplicitTermination = 30,
    TerminationException = 31,

    // Trigger Patterns (32-35)
    TransientTrigger = 32,
    PersistentTrigger = 33,
    CancelTrigger = 34,
    GeneralizedPick = 35,

    // New Patterns (36-43)
    ThreadMerge = 36,
    ThreadSplit = 37,
    BlockingPartialJoin = 38,
    BlockingDiscriminator = 39,
    GeneralizedAndJoin = 40,
    LocalSyncMerge = 41,
    GeneralizedOrJoin = 42,
    AcyclicSyncMerge = 43,
}

#[allow(dead_code)]
impl PatternType {
    /// Safe conversion from u8 to PatternType
    #[inline(always)]
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(PatternType::Sequence),
            2 => Some(PatternType::ParallelSplit),
            3 => Some(PatternType::Synchronization),
            4 => Some(PatternType::ExclusiveChoice),
            5 => Some(PatternType::SimpleMerge),
            6 => Some(PatternType::MultiChoice),
            7 => Some(PatternType::StructuredSyncMerge),
            8 => Some(PatternType::MultiMerge),
            9 => Some(PatternType::StructuredDiscriminator),
            10 => Some(PatternType::MultiInstanceNoSync),
            11 => Some(PatternType::MultiInstanceKnownDesignTime),
            12 => Some(PatternType::MultiInstanceKnownRuntime),
            13 => Some(PatternType::MultiInstanceUnknownRuntime),
            14 => Some(PatternType::StaticPartialJoin),
            15 => Some(PatternType::CancellationPartialJoin),
            16 => Some(PatternType::DeferredChoice),
            17 => Some(PatternType::InterleavedParallelRouting),
            18 => Some(PatternType::Milestone),
            19 => Some(PatternType::CriticalSection),
            20 => Some(PatternType::InterleavedRouting),
            21 => Some(PatternType::CancelTask),
            22 => Some(PatternType::CancelCase),
            23 => Some(PatternType::CancelRegion),
            24 => Some(PatternType::CancelMultipleInstance),
            25 => Some(PatternType::CompleteMultipleInstance),
            26 => Some(PatternType::ArbitraryLoop),
            27 => Some(PatternType::StructuredLoop),
            28 => Some(PatternType::Recursion),
            29 => Some(PatternType::ImplicitTermination),
            30 => Some(PatternType::ExplicitTermination),
            31 => Some(PatternType::TerminationException),
            32 => Some(PatternType::TransientTrigger),
            33 => Some(PatternType::PersistentTrigger),
            34 => Some(PatternType::CancelTrigger),
            35 => Some(PatternType::GeneralizedPick),
            36 => Some(PatternType::ThreadMerge),
            37 => Some(PatternType::ThreadSplit),
            38 => Some(PatternType::BlockingPartialJoin),
            39 => Some(PatternType::BlockingDiscriminator),
            40 => Some(PatternType::GeneralizedAndJoin),
            41 => Some(PatternType::LocalSyncMerge),
            42 => Some(PatternType::GeneralizedOrJoin),
            43 => Some(PatternType::AcyclicSyncMerge),
            _ => None,
        }
    }
}

/// Pattern configuration
#[repr(C, align(8))]
#[derive(Clone, Copy, Default)]
#[allow(dead_code)]
pub struct PatternConfig {
    pub max_instances: u32,
    pub join_threshold: u32,
    pub timeout_ticks: u64,
    pub flags: PatternFlags,
}

/// Pattern execution flags
#[repr(transparent)]
#[derive(Clone, Copy, Default)]
#[allow(dead_code)]
pub struct PatternFlags(u32);

#[allow(dead_code)]
impl PatternFlags {
    pub const CANCELLABLE: u32 = 0x01;
    pub const SYNCHRONOUS: u32 = 0x02;
    pub const PERSISTENT: u32 = 0x04;
    pub const CRITICAL: u32 = 0x08;
    pub const RECURSIVE: u32 = 0x10;

    pub fn new(flags: u32) -> Self {
        Self(flags)
    }

    #[inline(always)]
    pub fn is_cancellable(&self) -> bool {
        self.0 & Self::CANCELLABLE != 0
    }

    #[inline(always)]
    pub fn is_synchronous(&self) -> bool {
        self.0 & Self::SYNCHRONOUS != 0
    }
}

/// Pattern handler function type
type PatternHandler = fn(&PatternContext) -> PatternResult;

/// Pattern dispatcher for register-based routing
#[allow(dead_code)]
pub struct PatternDispatcher {
    /// Dispatch table (pattern type -> handler)
    dispatch_table: [PatternHandler; 44], // 0 is unused, 1-43 are patterns
}

/// Pattern execution context
#[repr(C, align(64))]
#[allow(dead_code)]
pub struct PatternContext {
    pub pattern_type: PatternType,
    pub pattern_id: u32,
    pub config: PatternConfig,
    pub input_mask: u64,
    pub output_mask: u64,
    pub state: AtomicU32,
    pub tick_budget: u32,
}

/// Pattern execution result
#[repr(C)]
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub struct PatternResult {
    pub success: bool,
    pub output_mask: u64,
    pub ticks_used: u32,
    pub next_pattern: Option<u32>,
}

#[allow(dead_code)]
impl PatternDispatcher {
    /// Create a new dispatcher with all pattern handlers
    pub fn new() -> Self {
        let mut dispatch_table: [PatternHandler; 44] = [pattern_noop; 44];

        // Register all 43 pattern handlers
        dispatch_table[PatternType::Sequence as usize] = pattern_sequence;
        dispatch_table[PatternType::ParallelSplit as usize] = pattern_parallel_split;
        dispatch_table[PatternType::Synchronization as usize] = pattern_synchronization;
        dispatch_table[PatternType::ExclusiveChoice as usize] = pattern_exclusive_choice;
        dispatch_table[PatternType::SimpleMerge as usize] = pattern_simple_merge;
        dispatch_table[PatternType::MultiChoice as usize] = pattern_multi_choice;
        dispatch_table[PatternType::StructuredSyncMerge as usize] = pattern_structured_sync_merge;
        dispatch_table[PatternType::MultiMerge as usize] = pattern_multi_merge;
        dispatch_table[PatternType::StructuredDiscriminator as usize] = pattern_structured_discriminator;
        dispatch_table[PatternType::MultiInstanceNoSync as usize] = pattern_multi_instance_no_sync;
        dispatch_table[PatternType::MultiInstanceKnownDesignTime as usize] = pattern_multi_instance_known_design_time;
        dispatch_table[PatternType::MultiInstanceKnownRuntime as usize] = pattern_multi_instance_known_runtime;
        dispatch_table[PatternType::MultiInstanceUnknownRuntime as usize] = pattern_multi_instance_unknown_runtime;
        dispatch_table[PatternType::StaticPartialJoin as usize] = pattern_static_partial_join;
        dispatch_table[PatternType::CancellationPartialJoin as usize] = pattern_cancellation_partial_join;
        dispatch_table[PatternType::DeferredChoice as usize] = pattern_deferred_choice;
        dispatch_table[PatternType::InterleavedParallelRouting as usize] = pattern_interleaved_parallel_routing;
        dispatch_table[PatternType::Milestone as usize] = pattern_milestone;
        dispatch_table[PatternType::CriticalSection as usize] = pattern_critical_section;
        dispatch_table[PatternType::InterleavedRouting as usize] = pattern_interleaved_routing;
        dispatch_table[PatternType::CancelTask as usize] = pattern_cancel_task;
        dispatch_table[PatternType::CancelCase as usize] = pattern_cancel_case;
        dispatch_table[PatternType::CancelRegion as usize] = pattern_cancel_region;
        dispatch_table[PatternType::CancelMultipleInstance as usize] = pattern_cancel_multiple_instance;
        dispatch_table[PatternType::CompleteMultipleInstance as usize] = pattern_complete_multiple_instance;
        dispatch_table[PatternType::ArbitraryLoop as usize] = pattern_arbitrary_loop;
        dispatch_table[PatternType::StructuredLoop as usize] = pattern_structured_loop;
        dispatch_table[PatternType::Recursion as usize] = pattern_recursion;
        dispatch_table[PatternType::ImplicitTermination as usize] = pattern_implicit_termination;
        dispatch_table[PatternType::ExplicitTermination as usize] = pattern_explicit_termination;
        dispatch_table[PatternType::TerminationException as usize] = pattern_termination_exception;
        dispatch_table[PatternType::TransientTrigger as usize] = pattern_transient_trigger;
        dispatch_table[PatternType::PersistentTrigger as usize] = pattern_persistent_trigger;
        dispatch_table[PatternType::CancelTrigger as usize] = pattern_cancel_trigger;
        dispatch_table[PatternType::GeneralizedPick as usize] = pattern_generalized_pick;
        dispatch_table[PatternType::ThreadMerge as usize] = pattern_thread_merge;
        dispatch_table[PatternType::ThreadSplit as usize] = pattern_thread_split;
        dispatch_table[PatternType::BlockingPartialJoin as usize] = pattern_blocking_partial_join;
        dispatch_table[PatternType::BlockingDiscriminator as usize] = pattern_blocking_discriminator;
        dispatch_table[PatternType::GeneralizedAndJoin as usize] = pattern_generalized_and_join;
        dispatch_table[PatternType::LocalSyncMerge as usize] = pattern_local_sync_merge;
        dispatch_table[PatternType::GeneralizedOrJoin as usize] = pattern_generalized_or_join;
        dispatch_table[PatternType::AcyclicSyncMerge as usize] = pattern_acyclic_sync_merge;

        Self { dispatch_table }
    }
}

impl Default for PatternDispatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
impl PatternDispatcher {
    /// Dispatch pattern execution (hot path, no branches)
    #[inline(always)]
    pub fn dispatch(&self, context: &PatternContext) -> PatternResult {
        let index = context.pattern_type as usize;

        // Bounds check is eliminated by compiler if we trust input
        debug_assert!(index > 0 && index < 44);

        // Direct index into dispatch table (no branches)
        // SAFETY: PatternType repr(u8) values are 1-43, array is 0-43.
        // Invariant maintained by PatternType enum and validate_pattern.
        let handler = unsafe { *self.dispatch_table.get_unchecked(index) };
        handler(context)
    }

    /// Validate pattern type
    #[inline]
    pub fn validate_pattern(&self, pattern_type: PatternType) -> bool {
        let index = pattern_type as usize;
        index > 0 && index < 44
    }
}

// ---------------------------------------------------------------------------
// Pattern handler implementations (optimized for <=8 ticks)
// ---------------------------------------------------------------------------

#[inline(always)]
fn pattern_noop(_ctx: &PatternContext) -> PatternResult {
    PatternResult {
        success: false,
        output_mask: 0,
        ticks_used: 1,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_sequence(ctx: &PatternContext) -> PatternResult {
    // Sequence: A -> B (simple linear execution)
    let timer = tick_start();

    // Check input ready
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    // Execute sequence (pass through)
    let output = ctx.input_mask;

    PatternResult {
        success: true,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_parallel_split(ctx: &PatternContext) -> PatternResult {
    // Parallel Split: A -> (B || C || D)
    let timer = tick_start();

    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    // Split to all branches (set multiple bits)
    let output = !0u64 >> (64 - ctx.config.max_instances.min(64));

    PatternResult {
        success: true,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None, // Multiple next patterns
    }
}

#[inline(always)]
fn pattern_synchronization(ctx: &PatternContext) -> PatternResult {
    // Synchronization: (B && C && D) -> A
    let timer = tick_start();

    // Check if all required inputs are ready
    let required_mask = !0u64 >> (64 - ctx.config.join_threshold.min(64));
    let ready = (ctx.input_mask & required_mask) == required_mask;

    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_exclusive_choice(ctx: &PatternContext) -> PatternResult {
    // Exclusive Choice: A -> B XOR C
    let timer = tick_start();

    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    // Choose based on lowest set bit (deterministic)
    let choice = ctx.input_mask & (!ctx.input_mask + 1);

    PatternResult {
        success: true,
        output_mask: choice,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + choice.trailing_zeros()),
    }
}

#[inline(always)]
fn pattern_simple_merge(ctx: &PatternContext) -> PatternResult {
    // Simple Merge: B OR C -> A
    let timer = tick_start();

    // Any input triggers output
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_multi_choice(ctx: &PatternContext) -> PatternResult {
    // Multi-Choice: A -> subset of (B, C, D)
    let timer = tick_start();

    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    // Select multiple branches based on input pattern
    let output = ctx.input_mask & ((1 << ctx.config.max_instances) - 1);

    PatternResult {
        success: true,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_structured_sync_merge(ctx: &PatternContext) -> PatternResult {
    // Structured Synchronizing Merge
    let timer = tick_start();

    // Wait for all active branches
    let active_branches = ctx.state.load(Ordering::Acquire);
    let ready = ctx.input_mask.count_ones() >= active_branches;

    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_multi_merge(ctx: &PatternContext) -> PatternResult {
    // Multi-Merge: non-synchronizing
    let timer = tick_start();

    // Each input generates an output
    let output = ctx.input_mask;

    PatternResult {
        success: ctx.input_mask != 0,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_structured_discriminator(ctx: &PatternContext) -> PatternResult {
    // Structured Discriminator: First completes
    let timer = tick_start();

    // Check if this is first completion
    let previous = ctx.state.swap(1, Ordering::AcqRel);

    if previous != 0 {
        // Not first
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }

    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

// ---------------------------------------------------------------------------
// Remaining 34 pattern handlers (10-43)
// Logic preserved from knhk; stub implementations for patterns not in
// the original source's handler set.
// ---------------------------------------------------------------------------

#[inline(always)]
fn pattern_multi_instance_no_sync(ctx: &PatternContext) -> PatternResult {
    // Multiple Instance without Synchronization
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_multi_instance_known_design_time(ctx: &PatternContext) -> PatternResult {
    // Multiple Instance with a priori known Design Time knowledge
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    let output = !0u64 >> (64 - ctx.config.max_instances.min(64));
    PatternResult {
        success: true,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_multi_instance_known_runtime(ctx: &PatternContext) -> PatternResult {
    // Multiple Instance with a priori known Runtime knowledge
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    let count = ctx.input_mask.count_ones();
    let output = !0u64 >> (64 - count.min(64));
    PatternResult {
        success: true,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_multi_instance_unknown_runtime(ctx: &PatternContext) -> PatternResult {
    // Multiple Instance with no a priori Runtime knowledge
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_static_partial_join(ctx: &PatternContext) -> PatternResult {
    // Static Partial Join for Multiple Instances
    let timer = tick_start();
    let ready = ctx.input_mask.count_ones() >= ctx.config.join_threshold;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_cancellation_partial_join(ctx: &PatternContext) -> PatternResult {
    // Cancelling Partial Join for Multiple Instances
    let timer = tick_start();
    let ready = ctx.input_mask.count_ones() >= ctx.config.join_threshold;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_deferred_choice(ctx: &PatternContext) -> PatternResult {
    // Deferred Choice: selection postponed until runtime
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    let choice = ctx.input_mask & (!ctx.input_mask + 1);
    PatternResult {
        success: true,
        output_mask: choice,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + choice.trailing_zeros()),
    }
}

#[inline(always)]
fn pattern_interleaved_parallel_routing(ctx: &PatternContext) -> PatternResult {
    // Interleaved Parallel Routing:交替 execution
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_milestone(ctx: &PatternContext) -> PatternResult {
    // Milestone: enabling condition based on process state
    let timer = tick_start();
    let reached = ctx.state.load(Ordering::Acquire) != 0;
    if !reached {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_critical_section(ctx: &PatternContext) -> PatternResult {
    // Critical Section: mutually exclusive access
    let timer = tick_start();
    let previous = ctx.state.swap(1, Ordering::AcqRel);
    if previous != 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_interleaved_routing(ctx: &PatternContext) -> PatternResult {
    // Interleaved Routing: interleaved execution of multiple branches
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_cancel_task(ctx: &PatternContext) -> PatternResult {
    // Cancel Task: withdraw a single enabled activity instance
    let timer = tick_start();
    ctx.state.store(1, Ordering::Release);
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_cancel_case(ctx: &PatternContext) -> PatternResult {
    // Cancel Case: withdraw a complete process instance
    let timer = tick_start();
    ctx.state.store(1, Ordering::Release);
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_cancel_region(ctx: &PatternContext) -> PatternResult {
    // Cancel Region: withdraw activities within a region
    let timer = tick_start();
    ctx.state.store(1, Ordering::Release);
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_cancel_multiple_instance(ctx: &PatternContext) -> PatternResult {
    // Cancel Multiple Instance: withdraw remaining instances
    let timer = tick_start();
    ctx.state.store(1, Ordering::Release);
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_complete_multiple_instance(ctx: &PatternContext) -> PatternResult {
    // Complete Multiple Instance: complete remaining instances
    let timer = tick_start();
    let ready = ctx.input_mask.count_ones() >= ctx.config.join_threshold;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_arbitrary_loop(ctx: &PatternContext) -> PatternResult {
    // Arbitrary Cycles: loops without restrictions
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id), // Loop back to self
    }
}

#[inline(always)]
fn pattern_structured_loop(ctx: &PatternContext) -> PatternResult {
    // Structured Loop: loops with a single entry and exit point
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id),
    }
}

#[inline(always)]
fn pattern_recursion(ctx: &PatternContext) -> PatternResult {
    // Recursion: process calls itself
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id), // Recursive call
    }
}

#[inline(always)]
fn pattern_implicit_termination(ctx: &PatternContext) -> PatternResult {
    // Implicit Termination: process completes when nothing else can be done
    let timer = tick_start();
    let done = ctx.input_mask == 0 && ctx.state.load(Ordering::Acquire) == 0;
    PatternResult {
        success: done,
        output_mask: if done { 1 } else { 0 },
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_explicit_termination(_ctx: &PatternContext) -> PatternResult {
    // Explicit Termination: explicit end event
    let timer = tick_start();
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_termination_exception(_ctx: &PatternContext) -> PatternResult {
    // Termination Exception: exceptional termination
    let timer = tick_start();
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_transient_trigger(ctx: &PatternContext) -> PatternResult {
    // Transient Trigger: signal consumed after firing
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_persistent_trigger(ctx: &PatternContext) -> PatternResult {
    // Persistent Trigger: signal persists after firing
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: ctx.input_mask,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_cancel_trigger(ctx: &PatternContext) -> PatternResult {
    // Cancel Trigger: signal cancels execution
    let timer = tick_start();
    ctx.state.store(1, Ordering::Release);
    PatternResult {
        success: true,
        output_mask: 0,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_generalized_pick(ctx: &PatternContext) -> PatternResult {
    // Generalized Pick: select from available signals
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    let choice = ctx.input_mask & (!ctx.input_mask + 1);
    PatternResult {
        success: true,
        output_mask: choice,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + choice.trailing_zeros()),
    }
}

#[inline(always)]
fn pattern_thread_merge(ctx: &PatternContext) -> PatternResult {
    // Thread Merge: merge parallel threads
    let timer = tick_start();
    let ready = ctx.input_mask.count_ones() >= ctx.config.join_threshold;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_thread_split(ctx: &PatternContext) -> PatternResult {
    // Thread Split: split into parallel threads
    let timer = tick_start();
    if ctx.input_mask == 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    let output = !0u64 >> (64 - ctx.config.max_instances.min(64));
    PatternResult {
        success: true,
        output_mask: output,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: None,
    }
}

#[inline(always)]
fn pattern_blocking_partial_join(ctx: &PatternContext) -> PatternResult {
    // Blocking Partial Join: block until threshold reached
    let timer = tick_start();
    let ready = ctx.input_mask.count_ones() >= ctx.config.join_threshold;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_blocking_discriminator(ctx: &PatternContext) -> PatternResult {
    // Blocking Discriminator: first to complete unblocks
    let timer = tick_start();
    let previous = ctx.state.swap(1, Ordering::AcqRel);
    if previous != 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_generalized_and_join(ctx: &PatternContext) -> PatternResult {
    // Generalized AND-Join: synchronizing merge with threshold
    let timer = tick_start();
    let required_mask = !0u64 >> (64 - ctx.config.join_threshold.min(64));
    let ready = (ctx.input_mask & required_mask) == required_mask;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_local_sync_merge(ctx: &PatternContext) -> PatternResult {
    // Local Synchronizing Merge: synchronize within scope
    let timer = tick_start();
    let active_branches = ctx.state.load(Ordering::Acquire);
    let ready = ctx.input_mask.count_ones() >= active_branches;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_generalized_or_join(ctx: &PatternContext) -> PatternResult {
    // Generalized OR-Join: first available triggers continuation
    let timer = tick_start();
    let previous = ctx.state.swap(1, Ordering::AcqRel);
    if previous != 0 {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: ctx.input_mask != 0,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

#[inline(always)]
fn pattern_acyclic_sync_merge(ctx: &PatternContext) -> PatternResult {
    // Acyclic Synchronizing Merge: sync merge without cycles
    let timer = tick_start();
    let required_mask = !0u64 >> (64 - ctx.config.join_threshold.min(64));
    let ready = (ctx.input_mask & required_mask) == required_mask;
    if !ready {
        return PatternResult {
            success: false,
            output_mask: 0,
            ticks_used: elapsed_ticks(timer) as u32,
            next_pattern: None,
        };
    }
    PatternResult {
        success: true,
        output_mask: 1,
        ticks_used: elapsed_ticks(timer) as u32,
        next_pattern: Some(ctx.pattern_id + 1),
    }
}

// ---------------------------------------------------------------------------
// Pattern factory for code generation
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub struct PatternFactory;

#[allow(dead_code)]
impl PatternFactory {
    /// Generate pattern from specification
    pub fn create(
        pattern_type: PatternType,
        pattern_id: u32,
        config: PatternConfig,
    ) -> PatternContext {
        PatternContext {
            pattern_type,
            pattern_id,
            config,
            input_mask: 0,
            output_mask: 0,
            state: AtomicU32::new(0),
            tick_budget: 8, // Default to Chatman constant
        }
    }

    /// Validate pattern specification
    pub fn validate(pattern_type: PatternType, config: &PatternConfig) -> Result<(), String> {
        match pattern_type {
            PatternType::ParallelSplit | PatternType::MultiChoice => {
                if config.max_instances == 0 || config.max_instances > 64 {
                    return Err("Invalid max_instances for split pattern".to_string());
                }
            }
            PatternType::Synchronization | PatternType::StructuredSyncMerge => {
                if config.join_threshold == 0 || config.join_threshold > 64 {
                    return Err("Invalid join_threshold for sync pattern".to_string());
                }
            }
            PatternType::Recursion => {
                if !config.flags.is_cancellable() {
                    return Err("Recursion patterns must be cancellable".to_string());
                }
            }
            _ => {}
        }

        Ok(())
    }
}

/// Pattern validator for compile-time checks
#[allow(dead_code)]
pub struct PatternValidator;

#[allow(dead_code)]
impl PatternValidator {
    /// Check if pattern combination is valid
    pub fn validate_combination(
        source: PatternType,
        target: PatternType,
    ) -> Result<(), String> {
        // Check against permutation matrix
        match (source, target) {
            (PatternType::ParallelSplit, PatternType::Synchronization) => Ok(()),
            (PatternType::ExclusiveChoice, PatternType::SimpleMerge) => Ok(()),
            (PatternType::MultiChoice, PatternType::StructuredSyncMerge) => Ok(()),
            _ => Err(format!(
                "Invalid pattern combination: {:?} -> {:?}",
                source, target
            )),
        }
    }

    /// Check pattern against permutation matrix
    pub fn check_permutation_matrix(pattern_type: PatternType) -> bool {
        // All 43 patterns are valid
        let index = pattern_type as usize;
        (1..=43).contains(&index)
    }
}

// ---------------------------------------------------------------------------
// Tests consolidated in tests/autonomic_tests.rs (pattern_dispatch_tests module)
