// RDTSC validation — Criterion benchmark of the cycle-counter read path.
//
// Measures the overhead of the portable `rdtsc()` cycle/timestamp source and a
// representative per-cycle "autoprocess" workload, the way the AutoProcessKernel
// hot loop reads the counter. This is an intrinsic microbenchmark (timer/ALU
// overhead) — there is no process-mining log domain here, so the input is a
// synthetic seed state rather than a real event log.
//
// Platform notes:
//   x86_64  → `_rdtsc()` returns CPU cycles directly.
//   aarch64 → wall-clock nanoseconds as a cycle proxy (cycles ≈ nanos * GHz).
//   other   → wall-clock nanoseconds.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;

#[cfg(target_arch = "x86_64")]
#[inline]
pub fn rdtsc() -> u64 {
    unsafe { std::arch::x86_64::_rdtsc() }
}

#[cfg(not(target_arch = "x86_64"))]
#[inline]
pub fn rdtsc() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

/// One measured "autoprocess" cycle: read the counter, run a small deterministic
/// state transition, read the counter again. Returns the elapsed delta so the
/// optimizer cannot drop the counter reads.
#[inline(never)]
fn measure_autoprocess_cycles(seed: u32) -> u64 {
    let start = rdtsc();
    let state = black_box(seed);
    let result = state.wrapping_mul(73).wrapping_add(17);
    let end = rdtsc();
    black_box(result);
    end.wrapping_sub(start)
}

fn bench_rdtsc(c: &mut Criterion) {
    // Raw counter read overhead.
    {
        let mut group = c.benchmark_group("rdtsc_counter");
        group.sample_size(200);
        group.measurement_time(Duration::from_secs(5));
        group.throughput(Throughput::Elements(1));
        group.bench_function("read", |b| {
            b.iter(|| black_box(rdtsc()));
        });
        group.finish();
    }

    // Single autoprocess cycle (counter read + state transition + counter read).
    {
        let mut group = c.benchmark_group("autoprocess_cycle");
        group.sample_size(200);
        group.measurement_time(Duration::from_secs(5));
        group.throughput(Throughput::Elements(1));
        group.bench_function("single", |b| {
            b.iter(|| black_box(measure_autoprocess_cycles(black_box(42))));
        });
        group.finish();
    }

    // Batched cycle loop across representative batch sizes, reporting throughput
    // in cycles/sec so per-cycle cost is comparable across batch sizes.
    {
        let mut group = c.benchmark_group("autoprocess_batch");
        group.sample_size(100);
        group.measurement_time(Duration::from_secs(6));
        for &batch in &[64u64, 256, 1_024, 4_096] {
            group.throughput(Throughput::Elements(batch));
            group.bench_with_input(BenchmarkId::from_parameter(batch), &batch, |b, &n| {
                b.iter(|| {
                    let mut acc: u64 = 0;
                    for i in 0..n {
                        acc = acc.wrapping_add(measure_autoprocess_cycles(black_box(i as u32)));
                    }
                    black_box(acc)
                });
            });
        }
        group.finish();
    }
}

criterion_group!(benches, bench_rdtsc);
criterion_main!(benches);
