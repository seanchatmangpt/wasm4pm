use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use prolog8::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
use prolog8::hash::{hash_bytes, DOMAIN_PROLOG8_FACT};
use prolog8::kernel::Kernel;
use prolog8::types::{
    Atom8, CatalogId, EpochId, FactBlock8, FactRow8, FeatureBit, PlanId, PredicateId, ProofMode,
    QueryAtom8, Rule8, RuleId, SourceId, TermId,
};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SRC: SourceId = SourceId(0);
const EPOCH: EpochId = EpochId(0);

fn v(n: u32) -> TermId {
    TermId(0x8000_0000 + n)
}

fn feature() -> u8 {
    FeatureBit::Facts.mask() | FeatureBit::HornRules.mask()
}

fn simple_rule(id: u32, head: Atom8, body: &[Atom8]) -> Rule8 {
    let mut body_arr = [Atom8::new(PredicateId(0), 0, &[]); 8];
    for (i, b) in body.iter().enumerate() {
        body_arr[i] = *b;
    }
    Rule8 {
        rule_id: RuleId(id),
        head,
        body: body_arr,
        body_len: body.len() as u8,
        body_mask: (1u8 << body.len()) - 1,
        negation_mask: 0,
        builtin_mask: 0,
        var_count: 8,
        var_live_mask: 0xFF,
        feature_mask: feature(),
        proof_mask: 0,
        plan_id: PlanId::default(),
    }
}

fn bound_query(atom: Atom8) -> QueryAtom8 {
    QueryAtom8 {
        atom,
        output_mask: 0,
        proof_mode: ProofMode::PositiveOnly,
        epoch: EPOCH,
    }
}

fn unbound_query(atom: Atom8, output_mask: u8) -> QueryAtom8 {
    QueryAtom8 {
        atom,
        output_mask,
        proof_mode: ProofMode::PositiveOnly,
        epoch: EPOCH,
    }
}

fn add_pred(cat: &mut Catalog, id: u32, label: &str, arity: u8) {
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(id),
        label: label.into(),
        arity,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
}

// ---------------------------------------------------------------------------
// 1. Kernel construction
// ---------------------------------------------------------------------------

fn bench_kernel_construction(c: &mut Criterion) {
    let mut group = c.benchmark_group("kernel/construction");
    group.throughput(Throughput::Elements(1));

    group.bench_function("empty_catalog", |b| {
        b.iter(|| {
            let cat = Catalog::new(CatalogId(1));
            std::hint::black_box(Kernel::new(cat))
        })
    });

    group.bench_function("ten_predicates_ten_terms", |b| {
        b.iter(|| {
            let mut cat = Catalog::new(CatalogId(2));
            for i in 1u32..=10 {
                add_pred(&mut cat, i, &format!("p{i}"), 1);
            }
            for i in 1u32..=10 {
                cat.intern_term(&format!("t{i}"));
            }
            std::hint::black_box(Kernel::new(cat))
        })
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// 2. Fact loading
// ---------------------------------------------------------------------------

fn bench_fact_loading(c: &mut Criterion) {
    let mut group = c.benchmark_group("kernel/fact_loading");

    for &n in &[1usize, 10, 100, 1000] {
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::new("rows", n), &n, |b, &n| {
            b.iter(|| {
                let mut cat = Catalog::new(CatalogId(20));
                add_pred(&mut cat, 1, "edge", 2);
                let mut k = Kernel::new(cat);
                let rows: Vec<FactRow8> = (0..n)
                    .map(|i| {
                        FactRow8::new(
                            PredicateId(1),
                            2,
                            &[TermId::new(i as u32 + 1), TermId::new(i as u32 + 2)],
                            SRC,
                        )
                    })
                    .collect();
                std::hint::black_box(
                    k.load_facts(FactBlock8::new(PredicateId(1), 2, rows))
                        .unwrap(),
                )
            })
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// 3. Direct fact lookup (baseline)
// ---------------------------------------------------------------------------

fn bench_direct_fact(c: &mut Criterion) {
    let mut group = c.benchmark_group("query/direct_fact");
    group.throughput(Throughput::Elements(1));

    // Build once, query repeatedly — measures pure query path
    let mut cat = Catalog::new(CatalogId(30));
    add_pred(&mut cat, 1, "parent", 2);
    let alice = cat.intern_term("alice");
    let bob = cat.intern_term("bob");
    let carol = cat.intern_term("carol");
    let mut k = Kernel::new(cat);
    k.load_facts(FactBlock8::new(
        PredicateId(1),
        2,
        vec![
            FactRow8::new(PredicateId(1), 2, &[alice, bob], SRC),
            FactRow8::new(PredicateId(1), 2, &[bob, carol], SRC),
        ],
    ))
    .unwrap();

    group.bench_function("hit_bound", |b| {
        let mut a = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        a.binding_mask = 0b11;
        let q = bound_query(a);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.bench_function("miss_bound", |b| {
        let mut a = Atom8::new(PredicateId(1), 2, &[alice, carol]);
        a.binding_mask = 0b11;
        let q = bound_query(a);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.bench_function("unbound_scan", |b| {
        let a = Atom8::new(PredicateId(1), 2, &[TermId::sentinel(), TermId::sentinel()]);
        let q = unbound_query(a, 0b11);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// 4. One-step rule (depth-1 backward chaining)
// ---------------------------------------------------------------------------

fn bench_rule_one_step(c: &mut Criterion) {
    let mut group = c.benchmark_group("query/rule_one_step");
    group.throughput(Throughput::Elements(1));

    // ancestor(?0, ?1) :- parent(?0, ?1)
    let mut cat = Catalog::new(CatalogId(40));
    add_pred(&mut cat, 1, "parent", 2);
    add_pred(&mut cat, 2, "ancestor", 2);
    let alice = cat.intern_term("alice");
    let bob = cat.intern_term("bob");
    let carol = cat.intern_term("carol");
    let mut k = Kernel::new(cat);
    k.load_facts(FactBlock8::new(
        PredicateId(1),
        2,
        vec![
            FactRow8::new(PredicateId(1), 2, &[alice, bob], SRC),
            FactRow8::new(PredicateId(1), 2, &[bob, carol], SRC),
        ],
    ))
    .unwrap();
    k.load_rule(simple_rule(
        1,
        Atom8::new(PredicateId(2), 2, &[v(0), v(1)]),
        &[Atom8::new(PredicateId(1), 2, &[v(0), v(1)])],
    ))
    .unwrap();

    group.bench_function("hit_bound", |b| {
        let mut a = Atom8::new(PredicateId(2), 2, &[alice, bob]);
        a.binding_mask = 0b11;
        let q = bound_query(a);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.bench_function("miss_bound", |b| {
        let mut a = Atom8::new(PredicateId(2), 2, &[alice, carol]);
        a.binding_mask = 0b11;
        let q = bound_query(a);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// 5. Recursive SLD — depth-N chains
//    grandparent(?0, ?2) :- parent(?0, ?1), parent(?1, ?2)
//    great_grandparent(?0, ?3) :- grandparent(?0, ?1), parent(?1, ?3)  [via rule→rule]
// ---------------------------------------------------------------------------

fn build_depth_n_kernel(depth: usize) -> (Kernel, Vec<TermId>, PredicateId, PredicateId) {
    let mut cat = Catalog::new(CatalogId(50));
    add_pred(&mut cat, 1, "parent", 2);
    add_pred(&mut cat, 2, "ancestor", 2);
    let mut nodes: Vec<TermId> = (0..=depth)
        .map(|i| cat.intern_term(&format!("n{i}")))
        .collect();
    let mut k = Kernel::new(cat);

    // Linear chain: parent(n0,n1), parent(n1,n2), ..., parent(n_{d-1}, n_d)
    let facts: Vec<FactRow8> = (0..depth)
        .map(|i| FactRow8::new(PredicateId(1), 2, &[nodes[i], nodes[i + 1]], SRC))
        .collect();
    k.load_facts(FactBlock8::new(PredicateId(1), 2, facts))
        .unwrap();

    // Rule: ancestor(?0, ?1) :- parent(?0, ?1)              [base]
    k.load_rule(simple_rule(
        1,
        Atom8::new(PredicateId(2), 2, &[v(0), v(1)]),
        &[Atom8::new(PredicateId(1), 2, &[v(0), v(1)])],
    ))
    .unwrap();

    // Rule: ancestor(?0, ?2) :- parent(?0, ?1), ancestor(?1, ?2)  [recursive — tests deep SLD]
    k.load_rule(simple_rule(
        2,
        Atom8::new(PredicateId(2), 2, &[v(0), v(2)]),
        &[
            Atom8::new(PredicateId(1), 2, &[v(0), v(1)]),
            Atom8::new(PredicateId(2), 2, &[v(1), v(2)]),
        ],
    ))
    .unwrap();

    (k, nodes, PredicateId(1), PredicateId(2))
}

fn bench_recursive_sld(c: &mut Criterion) {
    let mut group = c.benchmark_group("query/recursive_sld");
    group.throughput(Throughput::Elements(1));

    for &depth in &[2usize, 3, 5, 8] {
        let (k, nodes, _parent, ancestor) = build_depth_n_kernel(depth);
        let first = nodes[0];
        let last = *nodes.last().unwrap();

        group.bench_with_input(BenchmarkId::new("depth", depth), &depth, |b, _| {
            let mut a = Atom8::new(ancestor, 2, &[first, last]);
            a.binding_mask = 0b11;
            let q = bound_query(a);
            b.iter(|| std::hint::black_box(k.query(&q)))
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// 6. Multi-conjunct body (PARARULE-Plus depth-5 pattern)
//    Rule: conclusion(?0) :- a(?0), b(?0), c(?0), d(?0), e(?0)
// ---------------------------------------------------------------------------

fn bench_pararule_conjuncts(c: &mut Criterion) {
    let mut group = c.benchmark_group("query/pararule_conjuncts");
    group.throughput(Throughput::Elements(1));

    for &n_conjuncts in &[1usize, 2, 3, 5] {
        let mut cat = Catalog::new(CatalogId(60));
        for i in 1u32..=(n_conjuncts as u32 + 1) {
            add_pred(&mut cat, i, &format!("p{i}"), 1);
        }
        let x = cat.intern_term("x");
        let y = cat.intern_term("y"); // missing last fact
        let mut k = Kernel::new(cat);

        for pid in 1u32..=(n_conjuncts as u32) {
            k.load_facts(FactBlock8::new(
                PredicateId(pid),
                1,
                vec![
                    FactRow8::new(PredicateId(pid), 1, &[x], SRC),
                    FactRow8::new(PredicateId(pid), 1, &[y], SRC),
                ],
            ))
            .unwrap();
        }
        // y is missing the last fact — denial path
        let concl_pid = PredicateId(n_conjuncts as u32 + 1);
        let body: Vec<Atom8> = (1u32..=(n_conjuncts as u32))
            .map(|i| Atom8::new(PredicateId(i), 1, &[v(0)]))
            .collect();
        k.load_rule(simple_rule(1, Atom8::new(concl_pid, 1, &[v(0)]), &body))
            .unwrap();

        group.bench_with_input(
            BenchmarkId::new("conjuncts_hit", n_conjuncts),
            &n_conjuncts,
            |b, _| {
                let mut a = Atom8::new(concl_pid, 1, &[x]);
                a.binding_mask = 0b1;
                let q = bound_query(a);
                b.iter(|| std::hint::black_box(k.query(&q)))
            },
        );

        group.bench_with_input(
            BenchmarkId::new("conjuncts_miss", n_conjuncts),
            &n_conjuncts,
            |b, _| {
                let mut a = Atom8::new(concl_pid, 1, &[y]);
                a.binding_mask = 0b1;
                let q = bound_query(a);
                b.iter(|| std::hint::black_box(k.query(&q)))
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// 7. NAF (negation-as-failure)
// ---------------------------------------------------------------------------

fn bench_naf(c: &mut Criterion) {
    let mut group = c.benchmark_group("query/naf");
    group.throughput(Throughput::Elements(1));

    // Rule: quiet(?0) :- smart(?0), \+rough(?0)
    let mut cat = Catalog::new(CatalogId(70));
    add_pred(&mut cat, 1, "smart", 1);
    add_pred(&mut cat, 2, "rough", 1);
    add_pred(&mut cat, 3, "quiet", 1);
    let fiona = cat.intern_term("fiona"); // smart, NOT rough → quiet
    let gary = cat.intern_term("gary"); // smart AND rough → NOT quiet
    let mut k = Kernel::new(cat);

    k.load_facts(FactBlock8::new(
        PredicateId(1),
        1,
        vec![
            FactRow8::new(PredicateId(1), 1, &[fiona], SRC),
            FactRow8::new(PredicateId(1), 1, &[gary], SRC),
        ],
    ))
    .unwrap();
    k.load_facts(FactBlock8::new(
        PredicateId(2),
        1,
        vec![FactRow8::new(PredicateId(2), 1, &[gary], SRC)],
    ))
    .unwrap();

    let mut naf_rule = simple_rule(
        1,
        Atom8::new(PredicateId(3), 1, &[v(0)]),
        &[
            Atom8::new(PredicateId(1), 1, &[v(0)]),
            Atom8::new(PredicateId(2), 1, &[v(0)]),
        ],
    );
    naf_rule.feature_mask |= FeatureBit::StratifiedNegation.mask();
    naf_rule.negation_mask = 0b10;
    k.load_rule(naf_rule).unwrap();

    // NAF succeeds (fiona not rough)
    group.bench_function("naf_succeeds", |b| {
        let mut a = Atom8::new(PredicateId(3), 1, &[fiona]);
        a.binding_mask = 0b1;
        let q = bound_query(a);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    // NAF fails (gary is rough)
    group.bench_function("naf_fails", |b| {
        let mut a = Atom8::new(PredicateId(3), 1, &[gary]);
        a.binding_mask = 0b1;
        let q = bound_query(a);
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// 8. Receipt / BLAKE3
// ---------------------------------------------------------------------------

fn bench_receipt(c: &mut Criterion) {
    let mut group = c.benchmark_group("receipt");
    group.throughput(Throughput::Elements(1));

    group.bench_function("hash_fact_row", |b| {
        let row = FactRow8::new(PredicateId(1), 2, &[TermId::new(10), TermId::new(11)], SRC);
        b.iter(|| std::hint::black_box(row.canonical_hash()))
    });

    group.bench_function("hash_bytes_32", |b| {
        let payload = [0x42u8; 32];
        b.iter(|| std::hint::black_box(hash_bytes(&DOMAIN_PROLOG8_FACT, &payload)))
    });

    // Full query-to-receipt round trip
    group.bench_function("full_query_receipt", |b| {
        let mut cat = Catalog::new(CatalogId(80));
        add_pred(&mut cat, 1, "p", 2);
        let a = cat.intern_term("a");
        let bb = cat.intern_term("b");
        let mut k = Kernel::new(cat);
        k.load_facts(FactBlock8::new(
            PredicateId(1),
            2,
            vec![FactRow8::new(PredicateId(1), 2, &[a, bb], SRC)],
        ))
        .unwrap();
        let mut atom = Atom8::new(PredicateId(1), 2, &[a, bb]);
        atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom,
            output_mask: 0,
            proof_mode: ProofMode::Both,
            epoch: EPOCH,
        };
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// 28 benchmarks × (100ms warmup + 250ms measurement) ≈ 10s total wall clock.
fn fast_config() -> Criterion {
    Criterion::default()
        .warm_up_time(Duration::from_millis(100))
        .measurement_time(Duration::from_millis(250))
        .sample_size(10)
}

criterion_group!(
    name = benches;
    config = fast_config();
    targets =
        bench_kernel_construction,
        bench_fact_loading,
        bench_direct_fact,
        bench_rule_one_step,
        bench_recursive_sld,
        bench_pararule_conjuncts,
        bench_naf,
        bench_receipt,
);
criterion_main!(benches);
