use colored::Colorize;
use criterion::{criterion_group, criterion_main, Criterion, Throughput};
use std::hint::black_box;
use wasm4pm_cli::Io;

fn bench_io_construction(c: &mut Criterion) {
    let mut group = c.benchmark_group("io_construction");
    group.throughput(Throughput::Elements(1));

    group.bench_function("Io::new(false)", |b| {
        b.iter(|| {
            let io = Io::new(black_box(false));
            black_box(io);
        });
    });

    group.bench_function("Io::new(true)", |b| {
        b.iter(|| {
            let io = Io::new(black_box(true));
            black_box(io);
        });
    });

    group.finish();
}

fn bench_string_formatting(c: &mut Criterion) {
    let mut group = c.benchmark_group("string_formatting");
    group.throughput(Throughput::Elements(1));

    // mirrors Io::success: "{} {}", "✔".green(), text
    group.bench_function("success line", |b| {
        b.iter(|| {
            let s = format!("{} {}", "✔".green(), black_box("operation completed"));
            black_box(s);
        });
    });

    // mirrors Io::error: "{} {}", "✘".red(), text
    group.bench_function("error line", |b| {
        b.iter(|| {
            let s = format!("{} {}", "✘".red(), black_box("something went wrong"));
            black_box(s);
        });
    });

    // mirrors Io::header: text.to_string().bold().bright_cyan()
    group.bench_function("header line", |b| {
        b.iter(|| {
            let s = black_box("wasm4pm process mining platform")
                .to_string()
                .bold()
                .bright_cyan()
                .to_string();
            black_box(s);
        });
    });

    group.finish();
}

criterion_group!(benches, bench_io_construction, bench_string_formatting);
criterion_main!(benches);
