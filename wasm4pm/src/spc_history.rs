//! SPC History Ring Buffer — Fix one-shot SPC problem
//!
//! Maintains a sliding window of 100 SPC snapshots for historical analysis.
//! Enables Western Electric rules to evaluate trends across cycles, not just
//! within a single cycle's data.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

// ---------------------------------------------------------------------------
// Step 1: Ring Buffer Data Structure
// ---------------------------------------------------------------------------

/// Fixed-size ring buffer that automatically evicts oldest entries when full.
///
/// # Type Parameters
/// * `T` - Item type (must implement Clone)
/// * `N` - Capacity (max number of items stored)
///
/// # Example
/// ```
/// # use wasm4pm::spc_history::RingBuffer;
/// let mut buffer: RingBuffer<i32, 5> = RingBuffer::new();
/// buffer.push(1);
/// buffer.push(2);
/// assert_eq!(buffer.len(), 2);
/// ```
pub struct RingBuffer<T, const N: usize> {
    buffer: VecDeque<T>,
}

impl<T: Clone, const N: usize> Default for RingBuffer<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: Clone, const N: usize> RingBuffer<T, N> {
    /// Create a new empty ring buffer with capacity N.
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::RingBuffer;
    /// let buffer: RingBuffer<i32, 10> = RingBuffer::new();
    /// assert_eq!(buffer.len(), 0);
    /// ```
    pub fn new() -> Self {
        Self {
            buffer: VecDeque::with_capacity(N),
        }
    }

    /// Push an item into the buffer.
    ///
    /// If the buffer is full (len == N), the oldest item is evicted first.
    ///
    /// # Arguments
    /// * `item` - Item to store
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::RingBuffer;
    /// let mut buffer: RingBuffer<i32, 3> = RingBuffer::new();
    /// buffer.push(1);
    /// buffer.push(2);
    /// buffer.push(3);
    /// buffer.push(4); // 1 is evicted
    /// assert_eq!(buffer.len(), 3);
    /// ```
    pub fn push(&mut self, item: T) {
        if self.buffer.len() == N {
            self.buffer.pop_front();
        }
        self.buffer.push_back(item);
    }

    /// Return current number of items in the buffer.
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::RingBuffer;
    /// let mut buffer: RingBuffer<i32, 5> = RingBuffer::new();
    /// assert_eq!(buffer.len(), 0);
    /// buffer.push(42);
    /// assert_eq!(buffer.len(), 1);
    /// ```
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    /// Return true if buffer is empty.
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::RingBuffer;
    /// let buffer: RingBuffer<i32, 5> = RingBuffer::new();
    /// assert!(buffer.is_empty());
    /// ```
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Return iterator over items in insertion order (oldest to newest).
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::RingBuffer;
    /// let mut buffer: RingBuffer<i32, 3> = RingBuffer::new();
    /// buffer.push(1);
    /// buffer.push(2);
    /// let values: Vec<_> = buffer.iter().copied().collect();
    /// assert_eq!(values, vec![1, 2]);
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.buffer.iter()
    }

    /// Clear all items from the buffer.
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::RingBuffer;
    /// let mut buffer: RingBuffer<i32, 5> = RingBuffer::new();
    /// buffer.push(1);
    /// buffer.push(2);
    /// buffer.clear();
    /// assert_eq!(buffer.len(), 0);
    /// ```
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

// ---------------------------------------------------------------------------
// Step 2: SpcHistory Struct
// ---------------------------------------------------------------------------

/// Snapshot of SPC metrics at a point in time.
///
/// Captures the four key dimensions tracked by SPC:
/// - Event rate (events per trace)
/// - Trace duration average
/// - Activity frequency
/// - Health state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpcSnapshot {
    /// ISO-8601 timestamp or cycle identifier.
    pub timestamp: String,
    /// Mean events per trace.
    pub event_rate: f64,
    /// Mean trace duration in milliseconds.
    pub trace_duration_avg: f64,
    /// Activity frequency metric.
    pub activity_frequency: f64,
    /// Health state code (0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed).
    pub health_state: u8,
}

impl SpcSnapshot {
    /// Create a new SPC snapshot.
    ///
    /// # Arguments
    /// * `timestamp` - ISO-8601 timestamp or cycle identifier
    /// * `event_rate` - Mean events per trace
    /// * `trace_duration_avg` - Mean trace duration (ms)
    /// * `activity_frequency` - Activity frequency metric
    /// * `health_state` - Health state code (0-4)
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::SpcSnapshot;
    /// let snapshot = SpcSnapshot {
    ///     timestamp: "2026-04-13T12:00:00Z".to_string(),
    ///     event_rate: 5.2,
    ///     trace_duration_avg: 150.0,
    ///     activity_frequency: 0.85,
    ///     health_state: 0,
    /// };
    /// assert_eq!(snapshot.health_state, 0);
    /// ```
    pub fn new(
        timestamp: String,
        event_rate: f64,
        trace_duration_avg: f64,
        activity_frequency: f64,
        health_state: u8,
    ) -> Self {
        Self {
            timestamp,
            event_rate,
            trace_duration_avg,
            activity_frequency,
            health_state,
        }
    }
}

/// SPC history container with ring buffer storage.
///
/// Maintains up to 100 snapshots for trend analysis across cycles.
/// Enables detection of gradual degradation or improvement over time.
pub struct SpcHistory {
    /// Ring buffer storing up to 100 snapshots.
    pub history: RingBuffer<SpcSnapshot, 100>,
    /// Total number of cycles recorded (monotonically increasing).
    pub cycle_count: u64,
}

impl SpcHistory {
    /// Create a new empty SPC history.
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::SpcHistory;
    /// let history = SpcHistory::new();
    /// assert_eq!(history.cycle_count, 0);
    /// assert!(!history.has_sufficient_data());
    /// ```
    pub fn new() -> Self {
        Self {
            history: RingBuffer::new(),
            cycle_count: 0,
        }
    }

    /// Record a new snapshot into the history.
    ///
    /// Increments cycle count and stores snapshot (evicts oldest if full).
    ///
    /// # Arguments
    /// * `snapshot` - SPC metrics for this cycle
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::{SpcHistory, SpcSnapshot};
    /// let mut history = SpcHistory::new();
    /// let snapshot = SpcSnapshot::new(
    ///     "2026-04-13T12:00:00Z".to_string(),
    ///     5.2,
    ///     150.0,
    ///     0.85,
    ///     0,
    /// );
    /// history.record_snapshot(snapshot);
    /// assert_eq!(history.cycle_count, 1);
    /// assert!(!history.has_sufficient_data()); // needs 9 total
    /// ```
    pub fn record_snapshot(&mut self, snapshot: SpcSnapshot) {
        self.history.push(snapshot);
        self.cycle_count += 1;
    }

    /// Check if sufficient historical data exists for Western Electric rules.
    ///
    /// Returns true if at least 9 snapshots are recorded (minimum for Rule 2).
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::{SpcHistory, SpcSnapshot};
    /// let mut history = SpcHistory::new();
    /// assert!(!history.has_sufficient_data());
    ///
    /// for i in 0..9 {
    ///     history.record_snapshot(SpcSnapshot::new(
    ///         format!("cycle-{}", i),
    ///         5.0, 150.0, 0.8, 0,
    ///     ));
    /// }
    /// assert!(history.has_sufficient_data());
    /// ```
    pub fn has_sufficient_data(&self) -> bool {
        self.history.len() >= 9
    }

    /// Get historical event rates as a vector (oldest to newest).
    ///
    /// Useful for trend analysis and Western Electric Rule evaluation.
    ///
    /// # Returns
    /// Vector of event_rate values in chronological order
    ///
    /// # Example
    /// ```
    /// # use wasm4pm::spc_history::{SpcHistory, SpcSnapshot};
    /// let mut history = SpcHistory::new();
    /// history.record_snapshot(SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0));
    /// history.record_snapshot(SpcSnapshot::new("t2".into(), 5.5, 155.0, 0.82, 0));
    /// let rates = history.get_event_rates();
    /// assert_eq!(rates, vec![5.0, 5.5]);
    /// ```
    pub fn get_event_rates(&self) -> Vec<f64> {
        self.history.iter().map(|s| s.event_rate).collect()
    }

    /// Get historical trace duration averages as a vector (oldest to newest).
    ///
    /// # Returns
    /// Vector of trace_duration_avg values in chronological order
    pub fn get_trace_durations(&self) -> Vec<f64> {
        self.history.iter().map(|s| s.trace_duration_avg).collect()
    }

    /// Get historical activity frequencies as a vector (oldest to newest).
    ///
    /// # Returns
    /// Vector of activity_frequency values in chronological order
    pub fn get_activity_frequencies(&self) -> Vec<f64> {
        self.history.iter().map(|s| s.activity_frequency).collect()
    }

    /// Get all snapshots as a vector (oldest to newest).
    ///
    /// # Returns
    /// Vector of cloned snapshots in chronological order
    pub fn get_all_snapshots(&self) -> Vec<SpcSnapshot> {
        self.history.iter().cloned().collect()
    }

    /// Clear all history (reset to empty state).
    ///
    /// Cycle count resets to 0.
    pub fn clear(&mut self) {
        self.history.clear();
        self.cycle_count = 0;
    }
}

impl Default for SpcHistory {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Step 3: Thread Local Storage (accessed from lib.rs)
// ---------------------------------------------------------------------------

/// Thread-local storage for SPC history.
///
/// Defined in lib.rs as:
/// ```rust
/// thread_local! {
///     pub static SPC_HISTORY: RefCell<spc_history::SpcHistory> =
///         RefCell::new(spc_history::SpcHistory::new());
/// }
/// ```
///
/// Access via:
/// ```rust
/// SPC_HISTORY.with(|history| {
///     history.borrow_mut().record_snapshot(snapshot);
/// });
/// ```

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_basic() {
        let mut buffer: RingBuffer<i32, 3> = RingBuffer::new();
        assert_eq!(buffer.len(), 0);
        assert!(buffer.is_empty());

        buffer.push(1);
        assert_eq!(buffer.len(), 1);
        assert!(!buffer.is_empty());

        buffer.push(2);
        buffer.push(3);
        assert_eq!(buffer.len(), 3);

        // Eviction: buffer is full, push 4 should evict 1
        buffer.push(4);
        assert_eq!(buffer.len(), 3); // Still capacity 3
        let values: Vec<_> = buffer.iter().copied().collect();
        assert_eq!(values, vec![2, 3, 4]); // 1 evicted
    }

    #[test]
    fn test_ring_buffer_iteration() {
        let mut buffer: RingBuffer<i32, 5> = RingBuffer::new();
        buffer.push(10);
        buffer.push(20);
        buffer.push(30);

        let values: Vec<_> = buffer.iter().copied().collect();
        assert_eq!(values, vec![10, 20, 30]);
    }

    #[test]
    fn test_ring_buffer_clear() {
        let mut buffer: RingBuffer<i32, 5> = RingBuffer::new();
        buffer.push(1);
        buffer.push(2);
        buffer.clear();
        assert_eq!(buffer.len(), 0);
        assert!(buffer.is_empty());
    }

    #[test]
    fn test_spc_snapshot_new() {
        let snapshot = SpcSnapshot::new("2026-04-13T12:00:00Z".to_string(), 5.2, 150.0, 0.85, 0);
        assert_eq!(snapshot.timestamp, "2026-04-13T12:00:00Z");
        assert_eq!(snapshot.event_rate, 5.2);
        assert_eq!(snapshot.trace_duration_avg, 150.0);
        assert_eq!(snapshot.activity_frequency, 0.85);
        assert_eq!(snapshot.health_state, 0);
    }

    #[test]
    fn test_spc_history_new() {
        let history = SpcHistory::new();
        assert_eq!(history.cycle_count, 0);
        assert_eq!(history.history.len(), 0);
        assert!(!history.has_sufficient_data());
    }

    #[test]
    fn test_spc_history_record_snapshot() {
        let mut history = SpcHistory::new();
        let snapshot = SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0);

        history.record_snapshot(snapshot);
        assert_eq!(history.cycle_count, 1);
        assert_eq!(history.history.len(), 1);
        assert!(!history.has_sufficient_data()); // Needs 9
    }

    #[test]
    fn test_spc_history_sufficient_data() {
        let mut history = SpcHistory::new();

        // Add 8 snapshots - not enough
        for i in 0..8 {
            history.record_snapshot(SpcSnapshot::new(format!("cycle-{}", i), 5.0, 150.0, 0.8, 0));
        }
        assert!(!history.has_sufficient_data());

        // Add 9th snapshot - now sufficient
        history.record_snapshot(SpcSnapshot::new("cycle-8".into(), 5.0, 150.0, 0.8, 0));
        assert!(history.has_sufficient_data());
        assert_eq!(history.cycle_count, 9);
    }

    #[test]
    fn test_spc_history_get_event_rates() {
        let mut history = SpcHistory::new();
        history.record_snapshot(SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0));
        history.record_snapshot(SpcSnapshot::new("t2".into(), 5.5, 155.0, 0.82, 0));
        history.record_snapshot(SpcSnapshot::new("t3".into(), 6.0, 160.0, 0.84, 0));

        let rates = history.get_event_rates();
        assert_eq!(rates, vec![5.0, 5.5, 6.0]);
    }

    #[test]
    fn test_spc_history_get_trace_durations() {
        let mut history = SpcHistory::new();
        history.record_snapshot(SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0));
        history.record_snapshot(SpcSnapshot::new("t2".into(), 5.5, 155.0, 0.82, 0));

        let durations = history.get_trace_durations();
        assert_eq!(durations, vec![150.0, 155.0]);
    }

    #[test]
    fn test_spc_history_get_activity_frequencies() {
        let mut history = SpcHistory::new();
        history.record_snapshot(SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0));
        history.record_snapshot(SpcSnapshot::new("t2".into(), 5.5, 155.0, 0.82, 0));

        let freqs = history.get_activity_frequencies();
        assert_eq!(freqs, vec![0.8, 0.82]);
    }

    #[test]
    fn test_spc_history_ring_buffer_eviction() {
        let mut history = SpcHistory::new();

        // Fill buffer to capacity (100)
        for i in 0..100 {
            history.record_snapshot(SpcSnapshot::new(
                format!("cycle-{}", i),
                i as f64,
                150.0,
                0.8,
                0,
            ));
        }
        assert_eq!(history.history.len(), 100);
        assert_eq!(history.cycle_count, 100);

        // Add 101st snapshot - should evict oldest (cycle-0)
        history.record_snapshot(SpcSnapshot::new("cycle-100".into(), 100.0, 150.0, 0.8, 0));
        assert_eq!(history.history.len(), 100); // Still 100
        assert_eq!(history.cycle_count, 101);

        // Check that oldest is now cycle-1
        let oldest = history.history.iter().next().unwrap();
        assert_eq!(oldest.timestamp, "cycle-1");
        assert_eq!(oldest.event_rate, 1.0);
    }

    #[test]
    fn test_spc_history_clear() {
        let mut history = SpcHistory::new();
        history.record_snapshot(SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0));
        history.record_snapshot(SpcSnapshot::new("t2".into(), 5.5, 155.0, 0.82, 0));

        assert_eq!(history.cycle_count, 2);
        assert_eq!(history.history.len(), 2);

        history.clear();
        assert_eq!(history.cycle_count, 0);
        assert_eq!(history.history.len(), 0);
        assert!(history.history.is_empty());
    }

    #[test]
    fn test_spc_history_default() {
        let history = SpcHistory::default();
        assert_eq!(history.cycle_count, 0);
        assert_eq!(history.history.len(), 0);
    }

    #[test]
    fn test_spc_history_get_all_snapshots() {
        let mut history = SpcHistory::new();
        history.record_snapshot(SpcSnapshot::new("t1".into(), 5.0, 150.0, 0.8, 0));
        history.record_snapshot(SpcSnapshot::new("t2".into(), 5.5, 155.0, 0.82, 1));

        let snapshots = history.get_all_snapshots();
        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].timestamp, "t1");
        assert_eq!(snapshots[1].timestamp, "t2");
        assert_eq!(snapshots[0].health_state, 0);
        assert_eq!(snapshots[1].health_state, 1);
    }
}
