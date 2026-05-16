//! Rank-2 regression: `CLOCK_LOCK` serializes parallel mutations of the
//! global `TIME_OFFSET_MS` atomic.
//!
//! libtest runs `#[test]` functions within the same binary on a thread
//! pool, so two tests that both call `reset_clock()` + `advance_clock()`
//! can interleave and observe each other's mutations. `CLOCK_LOCK` is
//! the shared mutex test files acquire to serialize access.
//!
//! Oracle (Rank-2 domain contract): inside a section that holds
//! `CLOCK_LOCK`, if the holder issues total delta `D` via `advance_clock`
//! between two `now_ms()` reads, the observed delta must be in
//! `[D, D + WALL_CLOCK_DRIFT_BOUND_MS]`. The lower bound proves no
//! issued delta was dropped; the upper bound proves no sibling thread's
//! `advance_clock` leaked into our section. We can't read `TIME_OFFSET_MS`
//! directly from a test, so we lift the contract to this observable.

use std::sync::{Arc, Barrier};
use std::thread;

use wasm4pm::self_healing::{advance_clock, now_ms, reset_clock, with_clock_lock, CLOCK_LOCK};

const THREADS: usize = 8;
const ITERATIONS: u64 = 50;
const STEP_MS: u64 = 7;
/// Wall clock can only add to `now_ms()`; in practice the per-section
/// drift is sub-millisecond, but we keep a generous bound for CI runners.
const WALL_CLOCK_DRIFT_BOUND_MS: u64 = 50;

/// Inside `CLOCK_LOCK`, observed `now_ms()` deltas must match our own
/// `advance_clock` deltas within `WALL_CLOCK_DRIFT_BOUND_MS`.
///
/// Runs across `THREADS` workers contending for the lock simultaneously
/// via a barrier — this is where the original race manifested.
#[test]
fn parallel_clock_mutations_serialize_via_lock() {
    let barrier = Arc::new(Barrier::new(THREADS));
    let mut handles = Vec::with_capacity(THREADS);

    for tid in 0..THREADS {
        let b = barrier.clone();
        handles.push(thread::spawn(move || {
            b.wait(); // Maximize lock contention.

            for _ in 0..5 {
                with_clock_lock(|| {
                    reset_clock();
                    let t0 = now_ms();
                    let mut prev = t0;
                    for i in 1..=ITERATIONS {
                        advance_clock(STEP_MS);
                        let observed = now_ms();
                        let issued = i * STEP_MS;
                        let observed_delta = observed - t0;

                        assert!(
                            observed >= prev,
                            "thread {tid}: i={i} clock went backwards \
                             ({prev} -> {observed})",
                        );
                        assert!(
                            observed_delta >= issued,
                            "thread {tid}: i={i} issued {issued} ms but \
                             observed only {observed_delta} ms — \
                             advance_clock dropped",
                        );
                        let excess = observed_delta - issued;
                        assert!(
                            excess <= WALL_CLOCK_DRIFT_BOUND_MS,
                            "thread {tid}: i={i} observed {observed_delta} \
                             vs. issued {issued} — excess {excess} ms > \
                             drift bound {WALL_CLOCK_DRIFT_BOUND_MS} ms. \
                             Sibling thread leaked into our section.",
                        );
                        prev = observed;
                    }
                });
            }
        }));
    }

    for h in handles {
        h.join().expect("worker thread panicked");
    }
}

/// Smoke test: `CLOCK_LOCK` is genuinely shared (one `Mutex<()>` across
/// all callers), not per-instance. If two threads enter the critical
/// section at once, the lock is not actually serializing.
#[test]
fn raw_clock_lock_is_shared() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    let in_section = Arc::new(AtomicUsize::new(0));
    let max_concurrent = Arc::new(AtomicUsize::new(0));
    let barrier = Arc::new(Barrier::new(4));
    let mut handles = Vec::with_capacity(4);

    for _ in 0..4 {
        let in_section = in_section.clone();
        let max_concurrent = max_concurrent.clone();
        let b = barrier.clone();
        handles.push(thread::spawn(move || {
            b.wait();
            let _g = CLOCK_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let n = in_section.fetch_add(1, Ordering::SeqCst) + 1;
            max_concurrent.fetch_max(n, Ordering::SeqCst);
            // Hold the lock long enough that, if it weren't actually
            // shared, a sibling would observe `n > 1` before we drop.
            thread::sleep(Duration::from_millis(5));
            in_section.fetch_sub(1, Ordering::SeqCst);
        }));
    }

    for h in handles {
        h.join().expect("worker thread panicked");
    }

    let observed = max_concurrent.load(Ordering::SeqCst);
    assert_eq!(
        observed, 1,
        "CLOCK_LOCK is not shared — observed {observed} threads in \
         the critical section simultaneously",
    );
}
