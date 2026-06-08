use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pm4py_lsp::analysis::PipelineFacts;
use pm4py_lsp::receipts::SnapshotId;

const STANDARD_FIXTURE: &str = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
df = pm4py.format_dataframe(df, case_id='case:concept:name', activity_key='concept:name', timestamp_key='time:timestamp')
net, im, fm = pm4py.discover_petri_net_inductive(df)
fitness = pm4py.fitness_token_based_replay(df, net, im, fm)
pm4py.write_pnml(net, im, fm, 'output.pnml')
"#;

fn bench_static_analysis_throughput(c: &mut Criterion) {
    c.bench_function("B1_static_analysis_throughput", |b| {
        b.iter(|| {
            let facts = PipelineFacts::extract(black_box(STANDARD_FIXTURE));
            black_box(facts);
        })
    });
}

fn bench_snapshot_hash_latency(c: &mut Criterion) {
    c.bench_function("B3_snapshot_hash_latency", |b| {
        b.iter(|| {
            let snapshot_id = SnapshotId::new(
                black_box(&["file:///event_pipeline.py"]),
                black_box(&[STANDARD_FIXTURE]),
                black_box("{}"),
            );
            black_box(snapshot_id);
        })
    });
}

criterion_group!(
    benches,
    bench_static_analysis_throughput,
    bench_snapshot_hash_latency
);
criterion_main!(benches);
