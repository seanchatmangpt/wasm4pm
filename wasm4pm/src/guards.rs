// Ported from knhk/rust/knhk-kernel/src/guard.rs
// Guard evaluation engine for hot path
// Boolean gates with zero-overhead evaluation
// WASM-compatible: no filesystem I/O, no threads, no async

use rustc_hash::FxHashMap;

// ---------------------------------------------------------------------------
// State flags (replaces bitflags — no external dependency needed)
// ---------------------------------------------------------------------------

/// State flags for guard evaluation.
///
/// Each flag is a single bit in a u64. Combine with `|` (bitwise OR).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StateFlags(u64);

impl StateFlags {
    pub const INITIALIZED: StateFlags = StateFlags(0b0000_0001);
    pub const RUNNING: StateFlags = StateFlags(0b0000_0010);
    pub const SUSPENDED: StateFlags = StateFlags(0b0000_0100);
    pub const COMPLETED: StateFlags = StateFlags(0b0000_1000);
    pub const FAILED: StateFlags = StateFlags(0b0001_0000);
    pub const CANCELLED: StateFlags = StateFlags(0b0010_0000);
    pub const TIMEOUT: StateFlags = StateFlags(0b0100_0000);
    pub const RESOURCE_OK: StateFlags = StateFlags(0b1000_0000);

    /// Raw bits value.
    #[inline]
    #[allow(dead_code)]
    pub const fn bits(self) -> u64 {
        self.0
    }

    /// Whether all bits in `other` are set in `self`.
    #[inline]
    #[allow(dead_code)]
    pub const fn contains(self, other: StateFlags) -> bool {
        (self.0 & other.0) == other.0
    }
}

impl std::ops::BitOr for StateFlags {
    type Output = Self;
    #[inline]
    fn bitor(self, rhs: Self) -> Self {
        StateFlags(self.0 | rhs.0)
    }
}

impl std::ops::BitOrAssign for StateFlags {
    #[inline]
    fn bitor_assign(&mut self, rhs: Self) {
        self.0 |= rhs.0;
    }
}

// ---------------------------------------------------------------------------
// Guard types
// ---------------------------------------------------------------------------

/// Guard types for different conditions.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum GuardType {
    /// Simple predicate check
    Predicate = 0,
    /// Resource availability check
    Resource = 1,
    /// State flag check
    State = 2,
    /// Counter threshold check
    Counter = 3,
    /// Time window check
    TimeWindow = 4,
    /// Compound AND guard
    And = 5,
    /// Compound OR guard
    Or = 6,
    /// NOT guard (negation)
    Not = 7,
}

/// Predicate types for guard conditions.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Predicate {
    Equal = 0,
    NotEqual = 1,
    LessThan = 2,
    LessThanOrEqual = 3,
    GreaterThan = 4,
    GreaterThanOrEqual = 5,
    BitSet = 6,
    BitClear = 7,
    InRange = 8,
    NotInRange = 9,
}

/// Resource type for resource guards.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum ResourceType {
    Cpu = 0,
    Memory = 1,
    Io = 2,
    Queue = 3,
}

// ---------------------------------------------------------------------------
// Execution context types (self-contained, no cross-crate dependency)
// ---------------------------------------------------------------------------

/// Resource state for guard checks.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub struct ResourceState {
    pub cpu_available: u32,
    pub memory_available: u32,
    pub io_capacity: u32,
    pub queue_depth: u32,
}

/// Observation buffer (fixed-size for hot path).
#[repr(C)]
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ObservationBuffer {
    pub count: u32,
    pub observations: [u64; 16],
}

impl Default for ObservationBuffer {
    fn default() -> Self {
        Self {
            count: 0,
            observations: [0; 16],
        }
    }
}

/// Execution context for guard evaluation.
///
/// This is the input to every guard evaluation. It carries the current task
/// state, resource levels, observation counts, and a monotonically
/// increasing timestamp.
#[repr(C)]
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ExecutionContext {
    pub task_id: u64,
    pub timestamp: u64,
    pub resources: ResourceState,
    pub observations: ObservationBuffer,
    pub state_flags: u64,
}

// ---------------------------------------------------------------------------
// Guard configuration
// ---------------------------------------------------------------------------

/// Guard configuration.
#[derive(Debug, Clone, Default)]
#[allow(dead_code)]
pub struct GuardConfig {
    pub max_depth: u32,
    pub enable_caching: bool,
    pub cache_ttl_ticks: u64,
}

// ---------------------------------------------------------------------------
// Guard structure
// ---------------------------------------------------------------------------

/// Guard structure (compact for cache efficiency).
///
/// Supports simple predicates, resource checks, state flag checks,
/// counter thresholds, time windows, and compound boolean logic (AND / OR / NOT).
#[derive(Debug, Clone)]
pub struct Guard {
    pub guard_type: GuardType,
    pub predicate: Predicate,
    pub operand_a: u64,
    pub operand_b: u64,
    pub children: Vec<Guard>,
}

impl Guard {
    /// Create a simple predicate guard.
    ///
    /// `operand_a` encodes the field selector:
    ///   0 = task_id, 1 = timestamp, 2 = state_flags, 3 = observations.count
    #[inline]
    #[allow(dead_code)]
    pub fn predicate(pred: Predicate, a: u64, b: u64) -> Self {
        Self {
            guard_type: GuardType::Predicate,
            predicate: pred,
            operand_a: a,
            operand_b: b,
            children: Vec::new(),
        }
    }

    /// Create a resource guard.
    #[inline]
    #[allow(dead_code)]
    pub fn resource(resource: ResourceType, threshold: u32) -> Self {
        Self {
            guard_type: GuardType::Resource,
            predicate: Predicate::GreaterThanOrEqual,
            operand_a: resource as u64,
            operand_b: threshold as u64,
            children: Vec::new(),
        }
    }

    /// Create a state flag guard.
    #[inline]
    #[allow(dead_code)]
    pub fn state(flags: StateFlags) -> Self {
        Self {
            guard_type: GuardType::State,
            predicate: Predicate::BitSet,
            operand_a: flags.bits(),
            operand_b: 0,
            children: Vec::new(),
        }
    }

    /// Create an AND compound guard (all children must pass).
    #[inline]
    #[allow(dead_code)]
    pub fn and(guards: Vec<Guard>) -> Self {
        Self {
            guard_type: GuardType::And,
            predicate: Predicate::Equal,
            operand_a: 0,
            operand_b: 0,
            children: guards,
        }
    }

    /// Create an OR compound guard (any child passing is sufficient).
    #[inline]
    #[allow(dead_code)]
    pub fn or(guards: Vec<Guard>) -> Self {
        Self {
            guard_type: GuardType::Or,
            predicate: Predicate::Equal,
            operand_a: 0,
            operand_b: 0,
            children: guards,
        }
    }

    /// Create a NOT guard (negates the single child).
    #[inline]
    #[allow(dead_code)]
    pub fn not(guard: Guard) -> Self {
        Self {
            guard_type: GuardType::Not,
            predicate: Predicate::Equal,
            operand_a: 0,
            operand_b: 0,
            children: vec![guard],
        }
    }

    /// Evaluate guard against context (hot path optimized).
    #[inline(always)]
    #[allow(dead_code)]
    pub fn evaluate(&self, context: &ExecutionContext) -> bool {
        match self.guard_type {
            GuardType::Predicate => self.evaluate_predicate(context),
            GuardType::Resource => self.evaluate_resource(context),
            GuardType::State => self.evaluate_state(context),
            GuardType::Counter => self.evaluate_counter(context),
            GuardType::TimeWindow => self.evaluate_time_window(context),
            GuardType::And => self.evaluate_and(context),
            GuardType::Or => self.evaluate_or(context),
            GuardType::Not => self.evaluate_not(context),
        }
    }

    // -- private evaluators ------------------------------------------------

    /// Evaluate predicate guard (branchless where possible).
    #[inline(always)]
    fn evaluate_predicate(&self, context: &ExecutionContext) -> bool {
        let value = self.extract_value(context);

        match self.predicate {
            Predicate::Equal => value == self.operand_b,
            Predicate::NotEqual => value != self.operand_b,
            Predicate::LessThan => value < self.operand_b,
            Predicate::LessThanOrEqual => value <= self.operand_b,
            Predicate::GreaterThan => value > self.operand_b,
            Predicate::GreaterThanOrEqual => value >= self.operand_b,
            Predicate::BitSet => (value & self.operand_b) == self.operand_b,
            Predicate::BitClear => (value & self.operand_b) == 0,
            Predicate::InRange => value >= self.operand_a && value <= self.operand_b,
            Predicate::NotInRange => value < self.operand_a || value > self.operand_b,
        }
    }

    /// Evaluate resource guard.
    #[inline(always)]
    fn evaluate_resource(&self, context: &ExecutionContext) -> bool {
        let resource_type = self.operand_a as u8;
        let threshold = self.operand_b as u32;

        let available = match resource_type {
            0 => context.resources.cpu_available,
            1 => context.resources.memory_available,
            2 => context.resources.io_capacity,
            3 => context.resources.queue_depth,
            _ => 0,
        };

        available >= threshold
    }

    /// Evaluate state flag guard.
    #[inline(always)]
    fn evaluate_state(&self, context: &ExecutionContext) -> bool {
        let required_flags = self.operand_a;
        (context.state_flags & required_flags) == required_flags
    }

    /// Evaluate counter guard.
    #[inline(always)]
    fn evaluate_counter(&self, context: &ExecutionContext) -> bool {
        let counter_value = context.observations.count as u64;

        match self.predicate {
            Predicate::GreaterThanOrEqual => counter_value >= self.operand_b,
            Predicate::LessThanOrEqual => counter_value <= self.operand_b,
            _ => counter_value == self.operand_b,
        }
    }

    /// Evaluate time window guard.
    #[inline(always)]
    fn evaluate_time_window(&self, context: &ExecutionContext) -> bool {
        let current_time = context.timestamp;
        let window_start = self.operand_a;
        let window_end = self.operand_b;

        current_time >= window_start && current_time <= window_end
    }

    /// Evaluate AND compound guard (short-circuit).
    #[inline(always)]
    fn evaluate_and(&self, context: &ExecutionContext) -> bool {
        for child in &self.children {
            if !child.evaluate(context) {
                return false;
            }
        }
        true
    }

    /// Evaluate OR compound guard (short-circuit).
    #[inline(always)]
    fn evaluate_or(&self, context: &ExecutionContext) -> bool {
        for child in &self.children {
            if child.evaluate(context) {
                return true;
            }
        }
        false
    }

    /// Evaluate NOT guard.
    #[inline(always)]
    fn evaluate_not(&self, context: &ExecutionContext) -> bool {
        if let Some(child) = self.children.first() {
            !child.evaluate(context)
        } else {
            false
        }
    }

    /// Extract value from context based on operand_a.
    ///
    /// Field selector encoding:
    ///   0 = task_id, 1 = timestamp, 2 = state_flags, 3 = observations.count
    #[inline(always)]
    fn extract_value(&self, context: &ExecutionContext) -> u64 {
        match self.operand_a {
            0 => context.task_id,
            1 => context.timestamp,
            2 => context.state_flags,
            3 => context.observations.count as u64,
            _ => 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Guard evaluator with caching
// ---------------------------------------------------------------------------

/// Guard evaluator with result caching.
///
/// Uses `FxHashMap` for fast keyed lookups. Cache entries expire after
/// `cache_ttl` ticks.
#[allow(dead_code)]
pub struct GuardEvaluator {
    /// Cache for guard results (pattern_id -> (result, timestamp)).
    cache: FxHashMap<u32, (bool, u64)>,
    /// Cache TTL in ticks.
    cache_ttl: u64,
}

#[allow(dead_code)]
impl GuardEvaluator {
    /// Create a new evaluator with the given cache TTL (in ticks).
    pub fn new(cache_ttl: u64) -> Self {
        Self {
            cache: FxHashMap::default(),
            cache_ttl,
        }
    }

    /// Evaluate guard with caching.
    ///
    /// If the `pattern_id` has a cache entry that has not expired, the
    /// cached result is returned directly without re-evaluation.
    #[inline]
    pub fn evaluate_cached(
        &mut self,
        pattern_id: u32,
        guard: &Guard,
        context: &ExecutionContext,
    ) -> bool {
        // Check cache
        if let Some(&(result, timestamp)) = self.cache.get(&pattern_id) {
            if context.timestamp - timestamp < self.cache_ttl {
                return result;
            }
        }

        // Evaluate and cache
        let result = guard.evaluate(context);
        self.cache.insert(pattern_id, (result, context.timestamp));

        result
    }

    /// Clear expired cache entries.
    #[allow(dead_code)]
    pub fn clear_expired(&mut self, current_timestamp: u64) {
        self.cache
            .retain(|_, &mut (_, timestamp)| current_timestamp.saturating_sub(timestamp) < self.cache_ttl);
    }

    /// Clear the entire cache.
    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.cache.clear();
    }

    /// Number of entries currently in the cache.
    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.cache.len()
    }

    /// Whether the cache is empty.
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }
}

// ---------------------------------------------------------------------------
// Guard compiler (closure-based optimized evaluation)
// ---------------------------------------------------------------------------

/// Optimized guard compiler.
///
/// Compiles simple predicate guards into dedicated closures that avoid the
/// dispatch overhead of the generic `Guard::evaluate` method.
#[allow(dead_code)]
pub struct GuardCompiler;

#[allow(dead_code)]
impl GuardCompiler {
    /// Compile a guard to an optimized evaluation closure.
    ///
    /// For `GuardType::Predicate` this produces a specialised closure that
    /// inlines the value extraction and comparison. All other guard types
    /// fall back to `Guard::evaluate`.
    pub fn compile(guard: &Guard) -> Box<dyn Fn(&ExecutionContext) -> bool + '_> {
        match guard.guard_type {
            GuardType::Predicate => {
                let pred = guard.predicate;
                let op_a = guard.operand_a;
                let op_b = guard.operand_b;

                Box::new(move |ctx: &ExecutionContext| {
                    let value = match op_a {
                        0 => ctx.task_id,
                        1 => ctx.timestamp,
                        2 => ctx.state_flags,
                        3 => ctx.observations.count as u64,
                        _ => 0,
                    };

                    match pred {
                        Predicate::Equal => value == op_b,
                        Predicate::NotEqual => value != op_b,
                        Predicate::GreaterThan => value > op_b,
                        Predicate::GreaterThanOrEqual => value >= op_b,
                        _ => false,
                    }
                })
            }
            _ => Box::new(move |ctx| guard.evaluate(ctx)),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_context() -> ExecutionContext {
        ExecutionContext {
            task_id: 42,
            timestamp: 1000,
            resources: ResourceState {
                cpu_available: 80,
                memory_available: 1024,
                io_capacity: 100,
                queue_depth: 10,
            },
            observations: ObservationBuffer {
                count: 5,
                observations: [0; 16],
            },
            state_flags: StateFlags::INITIALIZED.bits() | StateFlags::RUNNING.bits(),
        }
    }

    #[test]
    fn test_predicate_guard() {
        let context = create_test_context();

        let guard = Guard::predicate(Predicate::Equal, 0, 42); // task_id == 42
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::GreaterThan, 1, 500); // timestamp > 500
        assert!(guard.evaluate(&context));

        let guard = Guard::predicate(Predicate::LessThan, 1, 500); // timestamp < 500
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_resource_guard() {
        let context = create_test_context();

        let guard = Guard::resource(ResourceType::Cpu, 50);
        assert!(guard.evaluate(&context)); // CPU available (80) >= 50

        let guard = Guard::resource(ResourceType::Memory, 2048);
        assert!(!guard.evaluate(&context)); // Memory (1024) < 2048
    }

    #[test]
    fn test_compound_guards() {
        let context = create_test_context();

        let g1 = Guard::predicate(Predicate::Equal, 0, 42);
        let g2 = Guard::resource(ResourceType::Cpu, 50);

        let and_guard = Guard::and(vec![g1.clone(), g2.clone()]);
        assert!(and_guard.evaluate(&context));

        let g3 = Guard::resource(ResourceType::Memory, 2048);
        let or_guard = Guard::or(vec![g2, g3]);
        assert!(or_guard.evaluate(&context)); // CPU check passes

        let not_guard = Guard::not(g1);
        assert!(!not_guard.evaluate(&context));
    }

    #[test]
    fn test_state_guard() {
        let context = create_test_context();

        let guard = Guard::state(StateFlags::INITIALIZED | StateFlags::RUNNING);
        assert!(guard.evaluate(&context));

        let guard = Guard::state(StateFlags::COMPLETED);
        assert!(!guard.evaluate(&context));
    }

    #[test]
    fn test_state_flags_contains() {
        let flags = StateFlags::INITIALIZED | StateFlags::RUNNING;
        assert!(flags.contains(StateFlags::INITIALIZED));
        assert!(flags.contains(StateFlags::RUNNING));
        assert!(!flags.contains(StateFlags::COMPLETED));
    }

    #[test]
    fn test_guard_evaluator_caching() {
        let mut evaluator = GuardEvaluator::new(100);
        let context = create_test_context();
        let guard = Guard::predicate(Predicate::Equal, 0, 42);

        // First evaluation
        let result = evaluator.evaluate_cached(1, &guard, &context);
        assert!(result);

        // Should use cache
        let result = evaluator.evaluate_cached(1, &guard, &context);
        assert!(result);

        // Clear expired entries (none should be expired yet)
        evaluator.clear_expired(context.timestamp + 50);
        assert_eq!(evaluator.len(), 1);

        // Clear expired entries (should be expired now)
        evaluator.clear_expired(context.timestamp + 200);
        assert_eq!(evaluator.len(), 0);
    }

    #[test]
    fn test_counter_guard() {
        let context = create_test_context(); // observations.count = 5

        let guard = Guard::predicate(Predicate::GreaterThanOrEqual, 3, 3);
        assert!(guard.evaluate(&context)); // 5 >= 3

        let guard = Guard::predicate(Predicate::LessThanOrEqual, 3, 5);
        assert!(guard.evaluate(&context)); // 5 <= 5

        let guard = Guard::predicate(Predicate::Equal, 3, 10);
        assert!(!guard.evaluate(&context)); // 5 != 10
    }

    #[test]
    fn test_time_window_guard() {
        let context = create_test_context(); // timestamp = 1000

        // [500, 1500]
        let _guard = Guard::predicate(Predicate::InRange, 1, 1500);
        // InRange uses operand_a as start, but predicate guard reads operand_a as field selector
        // For time window semantics use evaluate directly on a TimeWindow-type guard.
        // Instead, build the guard manually to test the TimeWindow path:
        let guard = Guard {
            guard_type: GuardType::TimeWindow,
            predicate: Predicate::Equal,
            operand_a: 500,
            operand_b: 1500,
            children: Vec::new(),
        };
        assert!(guard.evaluate(&context)); // 1000 in [500, 1500]

        let guard = Guard {
            guard_type: GuardType::TimeWindow,
            predicate: Predicate::Equal,
            operand_a: 2000,
            operand_b: 3000,
            children: Vec::new(),
        };
        assert!(!guard.evaluate(&context)); // 1000 not in [2000, 3000]
    }

    #[test]
    fn test_bit_set_clear_predicates() {
        let context = ExecutionContext {
            task_id: 0,
            timestamp: 0,
            resources: ResourceState {
                cpu_available: 0,
                memory_available: 0,
                io_capacity: 0,
                queue_depth: 0,
            },
            observations: ObservationBuffer::default(),
            state_flags: 0b1010, // bits 1 and 3 set
        };

        // BitSet: check that bit 1 (0b0010) is set
        let guard = Guard::predicate(Predicate::BitSet, 2, 0b0010);
        assert!(guard.evaluate(&context));

        // BitSet: check bit 2 (0b0100) — not set
        let guard = Guard::predicate(Predicate::BitSet, 2, 0b0100);
        assert!(!guard.evaluate(&context));

        // BitClear: check that bit 2 (0b0100) is clear
        let guard = Guard::predicate(Predicate::BitClear, 2, 0b0100);
        assert!(guard.evaluate(&context));
    }

    #[test]
    fn test_guard_compiler() {
        let context = create_test_context();

        // Compiled predicate
        let guard = Guard::predicate(Predicate::Equal, 0, 42);
        let compiled = GuardCompiler::compile(&guard);
        assert!(compiled(&context));

        // Compiled non-predicate falls back to evaluate
        let guard = Guard::resource(ResourceType::Cpu, 50);
        let compiled = GuardCompiler::compile(&guard);
        assert!(compiled(&context));
    }
}
