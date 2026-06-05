use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pm4py_lsp::diagnose_text;

const BAD_FIXTURE: &str = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
net, im, fm = pm4py.discover_petri_net_inductive(df)
"#;

const GOOD_FIXTURE: &str = r#"
import pm4py
import pandas as pd

df = pd.read_csv('event_log.csv')
df = pm4py.format_dataframe(df, case_id='case:concept:name', activity_key='concept:name', timestamp_key='time:timestamp')
net, im, fm = pm4py.discover_petri_net_inductive(df)
fitness = pm4py.fitness_token_based_replay(df, net, im, fm)
pm4py.write_pnml(net, im, fm, 'output.pnml')
"#;

fn bench_diagnostic_generation_latency(c: &mut Criterion) {
    c.bench_function("B2_diagnostic_generation_latency_bad", |b| {
        b.iter(|| {
            let diagnostics = diagnose_text(black_box(BAD_FIXTURE));
            black_box(diagnostics);
        })
    });

    c.bench_function("B2_diagnostic_generation_latency_good", |b| {
        b.iter(|| {
            let diagnostics = diagnose_text(black_box(GOOD_FIXTURE));
            black_box(diagnostics);
        })
    });
}

criterion_group!(benches, bench_diagnostic_generation_latency);
criterion_main!(benches);
