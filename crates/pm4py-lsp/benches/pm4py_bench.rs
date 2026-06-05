use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pm4py_lsp::analysis::PipelineFacts;
use pm4py_lsp::fixtures::{persist_fixture, Fixture};
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

fn bench_static_analysis(c: &mut Criterion) {
    c.bench_function("static_analysis", |b| {
        b.iter(|| {
            for _ in 0..100 {
                let facts = PipelineFacts::extract(black_box(STANDARD_FIXTURE));
                black_box(facts);
            }
        })
    });
}

fn bench_snapshot_generation(c: &mut Criterion) {
    c.bench_function("snapshot_generation", |b| {
        b.iter(|| {
            let facts = PipelineFacts::extract(black_box(STANDARD_FIXTURE));
            let snapshot_id = SnapshotId::new(
                black_box(&["file:///event_pipeline.py"]),
                black_box(&[STANDARD_FIXTURE]),
                black_box("{}"),
            );
            let fixture = Fixture {
                snapshot_id,
                data: serde_json::to_value(&facts).unwrap(),
            };
            black_box(fixture);
        })
    });
}

fn bench_fixture_write(c: &mut Criterion) {
    let dir = tempfile::tempdir().unwrap();
    let base_path = dir.path().to_path_buf();

    c.bench_function("fixture_write", |b| {
        b.iter(|| {
            let facts = PipelineFacts::extract(STANDARD_FIXTURE);
            let snapshot_id =
                SnapshotId::new(&["file:///event_pipeline.py"], &[STANDARD_FIXTURE], "{}");
            let fixture = Fixture {
                snapshot_id,
                data: serde_json::to_value(&facts).unwrap(),
            };
            persist_fixture(black_box(&fixture), black_box(&base_path)).unwrap();
        })
    });
}

criterion_group!(
    benches,
    bench_static_analysis,
    bench_snapshot_generation,
    bench_fixture_write
);
criterion_main!(benches);
