use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use wasm4pm::xes_format::load_eventlog_from_xes;

fn generate_xes(num_traces: usize) -> String {
    let mut xes = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<log>\n");
    for i in 0..num_traces {
        xes.push_str("  <trace>\n");
        xes.push_str(&format!(
            "    <string key=\"concept:name\" value=\"case_{}\"/>\n",
            i
        ));
        for j in 0..10 {
            xes.push_str("    <event>\n");
            xes.push_attr("concept:name", &format!("activity_{}", j));
            xes.push_str("    </event>\n");
        }
        xes.push_str("  </trace>\n");
    }
    xes.push_str("</log>");
    xes
}

trait XesExt {
    fn push_attr(&mut self, key: &str, value: &str);
}

impl XesExt for String {
    fn push_attr(&mut self, key: &str, value: &str) {
        self.push_str(&format!(
            "      <string key=\"{}\" value=\"{}\"/>\n",
            key, value
        ));
    }
}

fn bench_xes_loader(c: &mut Criterion) {
    let xes_1k = generate_xes(1000);
    let xes_10k = generate_xes(10000);

    let mut group = c.benchmark_group("loader/xes");

    // Throughput reported as bytes/sec so parse rate is comparable across input
    // sizes; black_box prevents the optimizer from eliding the parse result.
    group.throughput(Throughput::Bytes(xes_1k.len() as u64));
    group.bench_function("1k_traces", |b| {
        b.iter(|| black_box(load_eventlog_from_xes(black_box(&xes_1k))))
    });

    group.throughput(Throughput::Bytes(xes_10k.len() as u64));
    group.bench_function("10k_traces", |b| {
        b.iter(|| black_box(load_eventlog_from_xes(black_box(&xes_10k))))
    });

    group.finish();
}

criterion_group!(benches, bench_xes_loader);
criterion_main!(benches);
