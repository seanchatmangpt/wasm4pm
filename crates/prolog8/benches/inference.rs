use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use prolog8::admission::{admit_atom, admit_rule};
use prolog8::catalog::{Catalog, PredicateMeta, PredicateProofPolicy};
use prolog8::hash::{hash_bytes, DOMAIN_PROLOG8_FACT};
use prolog8::kernel::Kernel;
use prolog8::types::{
    Atom8, CatalogId, EpochId, FactBlock8, FactRow8, FeatureBit, PlanId, PredicateId, ProofMode,
    QueryAtom8, Rule8, RuleId, SourceId, TermId,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_catalog_empty() -> Catalog {
    Catalog::new(CatalogId(1))
}

fn make_catalog_one_pred() -> Catalog {
    let mut cat = Catalog::new(CatalogId(2));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "edge".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    cat.intern_term("a");
    cat.intern_term("b");
    cat
}

fn make_catalog_five_preds() -> Catalog {
    let mut cat = Catalog::new(CatalogId(3));
    for i in 1u32..=5 {
        cat.add_predicate(PredicateMeta {
            pred_id: PredicateId(i),
            label: format!("pred{i}"),
            arity: 2,
            access_orders: vec![],
            proof_policy: PredicateProofPolicy::OnRequest,
            materialized: false,
        });
    }
    for label in ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] {
        cat.intern_term(label);
    }
    cat
}

/// Build a kernel with predicate `parent` (id=1, arity=2) and `ancestor` (id=2, arity=2).
/// Returns (kernel, alice_id, bob_id, carol_id).
fn build_chain_kernel() -> (Kernel, TermId, TermId, TermId) {
    let mut cat = Catalog::new(CatalogId(10));
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(1),
        label: "parent".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    cat.add_predicate(PredicateMeta {
        pred_id: PredicateId(2),
        label: "ancestor".into(),
        arity: 2,
        access_orders: vec![],
        proof_policy: PredicateProofPolicy::OnRequest,
        materialized: false,
    });
    let alice = cat.intern_term("alice");
    let bob = cat.intern_term("bob");
    let carol = cat.intern_term("carol");

    let mut k = Kernel::new(cat);

    let rows = vec![
        FactRow8::new(PredicateId(1), 2, &[alice, bob], SourceId(0)),
        FactRow8::new(PredicateId(1), 2, &[bob, carol], SourceId(0)),
    ];
    k.load_facts(FactBlock8::new(PredicateId(1), 2, rows))
        .unwrap();

    (k, alice, bob, carol)
}

fn build_rows(pred_id: PredicateId, n: usize) -> Vec<FactRow8> {
    (0..n)
        .map(|i| {
            FactRow8::new(
                pred_id,
                2,
                &[TermId::new(i as u32 + 1), TermId::new(i as u32 + 2)],
                SourceId(0),
            )
        })
        .collect()
}

// ---------------------------------------------------------------------------
// 1. Kernel construction
// ---------------------------------------------------------------------------

fn bench_kernel_construction(c: &mut Criterion) {
    let mut group = c.benchmark_group("kernel_construction");
    group.throughput(Throughput::Elements(1));

    group.bench_function(BenchmarkId::new("empty_catalog", ""), |b| {
        b.iter(|| {
            let cat = make_catalog_empty();
            std::hint::black_box(Kernel::new(cat))
        })
    });

    group.bench_function(BenchmarkId::new("one_predicate", ""), |b| {
        b.iter(|| {
            let cat = make_catalog_one_pred();
            std::hint::black_box(Kernel::new(cat))
        })
    });

    group.bench_function(BenchmarkId::new("five_predicates", ""), |b| {
        b.iter(|| {
            let cat = make_catalog_five_preds();
            std::hint::black_box(Kernel::new(cat))
        })
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// 2. Fact loading
// ---------------------------------------------------------------------------

fn bench_fact_loading(c: &mut Criterion) {
    let mut group = c.benchmark_group("fact_loading");

    for row_count in [1usize, 10, 100] {
        group.throughput(Throughput::Elements(row_count as u64));
        group.bench_with_input(
            BenchmarkId::new("load_facts", row_count),
            &row_count,
            |b, &n| {
                b.iter(|| {
                    let mut cat = Catalog::new(CatalogId(20));
                    cat.add_predicate(PredicateMeta {
                        pred_id: PredicateId(1),
                        label: "edge".into(),
                        arity: 2,
                        access_orders: vec![],
                        proof_policy: PredicateProofPolicy::OnRequest,
                        materialized: false,
                    });
                    let mut k = Kernel::new(cat);
                    let rows = build_rows(PredicateId(1), n);
                    let block = FactBlock8::new(PredicateId(1), 2, rows);
                    std::hint::black_box(k.load_facts(block).unwrap())
                })
            },
        );
    }

    group.finish();
}

// ---------------------------------------------------------------------------
// 3. Query
// ---------------------------------------------------------------------------

fn bench_query(c: &mut Criterion) {
    let mut group = c.benchmark_group("query");
    group.throughput(Throughput::Elements(1));

    // Simple 1-fact direct lookup: parent(alice, bob)?
    group.bench_function(BenchmarkId::new("direct_fact_lookup", ""), |b| {
        let (k, alice, bob, _carol) = build_chain_kernel();
        let mut q_atom = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    // 2-step chain via rule: ancestor(alice, bob) :- parent(alice, bob).
    group.bench_function(BenchmarkId::new("rule_chain_query", ""), |b| {
        let (mut k, alice, bob, _carol) = build_chain_kernel();

        // ancestor(alice, bob) :- parent(alice, bob)
        let head = Atom8::new(PredicateId(2), 2, &[alice, bob]);
        let body0 = Atom8::new(PredicateId(1), 2, &[alice, bob]);
        let mut body_arr = [Atom8::new(PredicateId(1), 0, &[]); 8];
        body_arr[0] = body0;
        let rule = Rule8 {
            rule_id: RuleId(1),
            head,
            body: body_arr,
            body_len: 1,
            body_mask: 0b1,
            negation_mask: 0,
            builtin_mask: 0,
            var_count: 0,
            var_live_mask: 0,
            feature_mask: FeatureBit::Facts.mask() | FeatureBit::HornRules.mask(),
            proof_mask: 0,
            plan_id: PlanId::default(),
        };
        k.load_rule(rule).unwrap();

        let mut q_atom = Atom8::new(PredicateId(2), 2, &[alice, bob]);
        q_atom.binding_mask = 0b11;
        let q = QueryAtom8 {
            atom: q_atom,
            output_mask: 0,
            proof_mode: ProofMode::PositiveOnly,
            epoch: EpochId(0),
        };
        b.iter(|| std::hint::black_box(k.query(&q)))
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// 4. BLAKE3 hashing
// ---------------------------------------------------------------------------

fn bench_blake3(c: &mut Criterion) {
    let mut group = c.benchmark_group("blake3");
    group.throughput(Throughput::Elements(1));

    group.bench_function(BenchmarkId::new("hash_term_id", ""), |b| {
        let tid = TermId::new(42);
        b.iter(|| {
            let bytes = tid.as_u32().to_le_bytes();
            std::hint::black_box(hash_bytes(&DOMAIN_PROLOG8_FACT, &bytes))
        })
    });

    group.bench_function(BenchmarkId::new("hash_fact_row", ""), |b| {
        let row = FactRow8::new(
            PredicateId(1),
            2,
            &[TermId::new(10), TermId::new(11)],
            SourceId(0),
        );
        b.iter(|| std::hint::black_box(row.canonical_hash()))
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// Criterion registration
// ---------------------------------------------------------------------------

criterion_group!(
    benches,
    bench_kernel_construction,
    bench_fact_loading,
    bench_query,
    bench_blake3
);
criterion_main!(benches);
