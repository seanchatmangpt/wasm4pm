use criterion::{criterion_group, criterion_main, Criterion};
use wasm4pm_macros::powl_activity;

#[powl_activity(activity = "bench.step")]
fn instrumented_step() -> u32 {
    42
}

fn raw_step() -> u32 {
    42
}

fn bench_powl_macro_overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("powl/macro");

    group.bench_function("raw_function", |b| b.iter(|| raw_step()));

    group.bench_function("instrumented_function", |b| b.iter(|| instrumented_step()));

    group.finish();
}

criterion_group!(benches, bench_powl_macro_overhead);
criterion_main!(benches);
