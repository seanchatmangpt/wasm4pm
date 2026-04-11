use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pictl::hot_kernels::*;

// Prevent compiler from optimizing away results
#[inline(never)]
fn consume<T>(val: T) {
    std::mem::forget(val);
}

// ============================================================
// HOT PATH: TRANSITION + CONSTRUCT8
// ============================================================

fn bench_ingress_decide_4(c: &mut Criterion) {
    c.bench_function("ingress_decide_4_lawful", |b| {
        b.iter(|| {
            let state = black_box(HotState {
                current: 100,
                previous: 99,
                epoch: 0,
                flags: 0,
            });

            let rules = black_box([
                TransitionRule { from: 100, to: 101, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 101, to: 102, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 102, to: 103, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 103, to: 104, require_mask: 0, forbid_mask: 0 },
            ]);

            let result = ingress_decide_4(
                black_box(5000),
                state,
                black_box(101),
                &rules,
                black_box(0x123456789abcdef0),
            );
            consume(result);
        })
    });

    c.bench_function("ingress_decide_4_unlawful", |b| {
        b.iter(|| {
            let state = black_box(HotState {
                current: 100,
                previous: 99,
                epoch: 0,
                flags: 0,
            });

            let rules = black_box([
                TransitionRule { from: 100, to: 101, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 101, to: 102, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 102, to: 103, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 103, to: 104, require_mask: 0, forbid_mask: 0 },
            ]);

            let result = ingress_decide_4(
                black_box(5000),
                state,
                black_box(104),
                &rules,
                black_box(0x123456789abcdef0),
            );
            consume(result);
        })
    });
}

fn bench_ingress_decide_8(c: &mut Criterion) {
    c.bench_function("ingress_decide_8_lawful", |b| {
        b.iter(|| {
            let state = black_box(HotState {
                current: 200,
                previous: 199,
                epoch: 5,
                flags: 0,
            });

            let rules = black_box([
                TransitionRule { from: 200, to: 201, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 201, to: 202, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 202, to: 203, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 203, to: 204, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 204, to: 205, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 205, to: 206, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 206, to: 207, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 207, to: 208, require_mask: 0, forbid_mask: 0 },
            ]);

            let result = ingress_decide_8(
                black_box(5000),
                state,
                black_box(201),
                &rules,
                black_box(0x123456789abcdef0),
            );
            consume(result);
        })
    });

    c.bench_function("ingress_decide_8_unlawful", |b| {
        b.iter(|| {
            let state = black_box(HotState {
                current: 200,
                previous: 199,
                epoch: 5,
                flags: 0,
            });

            let rules = black_box([
                TransitionRule { from: 200, to: 201, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 201, to: 202, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 202, to: 203, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 203, to: 204, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 204, to: 205, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 205, to: 206, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 206, to: 207, require_mask: 0, forbid_mask: 0 },
                TransitionRule { from: 207, to: 208, require_mask: 0, forbid_mask: 0 },
            ]);

            let result = ingress_decide_8(
                black_box(5000),
                state,
                black_box(210),
                &rules,
                black_box(0x123456789abcdef0),
            );
            consume(result);
        })
    });
}

fn bench_construct8(c: &mut Criterion) {
    c.bench_function("construct8_transition", |b| {
        b.iter(|| {
            let case_id = black_box(5000u32);
            let prev_state = black_box(HotState {
                current: 100,
                previous: 99,
                epoch: 7,
                flags: 0,
            });
            let ingress = black_box(IngressResult {
                lawful: 1,
                ticks: CHATMAN_CONSTANT_TICKS,
                edge_lo: 100,
                edge_hi: 101,
                next_state: HotState {
                    current: 101,
                    previous: 100,
                    epoch: 8,
                    flags: 0,
                },
                receipt_seed: 0xfeedfacedeadbeef,
            });
            let predicates = black_box(HotPredicates {
                has_current: 10,
                had_previous: 11,
                has_epoch: 12,
                has_flags: 13,
                has_edge_lo: 14,
                has_edge_hi: 15,
                has_lawful: 16,
                has_receipt: 17,
            });
            let ids = black_box(HotIds {
                lawful_true: 1,
                lawful_false: 0,
            });

            let result = construct8_transition(case_id, prev_state, ingress, predicates, ids);
            consume(result);
        })
    });
}

// ============================================================
// PETRI-NET: MARKING + FIRING
// ============================================================

fn bench_marking_ops(c: &mut Criterion) {
    c.bench_function("marking_enabled4", |b| {
        b.iter(|| {
            let m = black_box(Marking4 { p0: 1, p1: 1, p2: 0, p3: 0 });
            let t = black_box(Transition4 {
                in0: 1,
                in1: 1,
                in2: 0,
                in3: 0,
                out0: 0,
                out1: 0,
                out2: 1,
                out3: 0,
            });
            let result = marking_enabled4(m, t);
            consume(result);
        })
    });

    c.bench_function("marking_fire4", |b| {
        b.iter(|| {
            let m = black_box(Marking4 { p0: 1, p1: 1, p2: 0, p3: 0 });
            let t = black_box(Transition4 {
                in0: 1,
                in1: 1,
                in2: 0,
                in3: 0,
                out0: 0,
                out1: 0,
                out2: 1,
                out3: 0,
            });
            let result = marking_fire4(m, t, 1);
            consume(result);
        })
    });

    c.bench_function("marking_fire4_disabled", |b| {
        b.iter(|| {
            let m = black_box(Marking4 { p0: 1, p1: 1, p2: 0, p3: 0 });
            let t = black_box(Transition4 {
                in0: 1,
                in1: 1,
                in2: 0,
                in3: 0,
                out0: 0,
                out1: 0,
                out2: 1,
                out3: 0,
            });
            let result = marking_fire4(m, t, 0);
            consume(result);
        })
    });
}

// ============================================================
// BIT OPERATIONS
// ============================================================

fn bench_bitwise_ops(c: &mut Criterion) {
    c.bench_function("ask_eq_u32", |b| {
        b.iter(|| ask_eq_u32(black_box(42), black_box(42)))
    });

    c.bench_function("compare_lt_u32", |b| {
        b.iter(|| compare_lt_u32(black_box(10), black_box(20)))
    });

    c.bench_function("validate_range_u32", |b| {
        b.iter(|| validate_range_u32(black_box(15), black_box(10), black_box(20)))
    });

    c.bench_function("min_u32", |b| {
        b.iter(|| min_u32(black_box(100), black_box(50)))
    });

    c.bench_function("max_u32", |b| {
        b.iter(|| max_u32(black_box(100), black_box(50)))
    });

    c.bench_function("abs_diff_u32", |b| {
        b.iter(|| abs_diff_u32(black_box(100), black_box(40)))
    });

    c.bench_function("select_u32", |b| {
        b.iter(|| select_u32(black_box(1), black_box(42), black_box(99)))
    });

    c.bench_function("popcount_u64", |b| {
        b.iter(|| popcount_u64(black_box(0xfeedfacedeadbeef)))
    });

    c.bench_function("leading_zeros_u64", |b| {
        b.iter(|| leading_zeros_u64(black_box(0x0000000100000000)))
    });
}

// ============================================================
// HASHING & RECEIPT
// ============================================================

fn bench_hashing(c: &mut Criterion) {
    c.bench_function("fmix64", |b| {
        b.iter(|| fmix64(black_box(0x123456789abcdef0)))
    });

    c.bench_function("bithash_u64", |b| {
        b.iter(|| bithash_u64(black_box(0xfeedfacedeadbeef)))
    });

    c.bench_function("receipt_seed_mix", |b| {
        b.iter(|| {
            receipt_seed_mix(
                black_box(0x123456789abcdef0),
                black_box(5000),
                black_box(100),
                black_box(101),
                black_box(8),
                black_box(0),
            )
        })
    });
}

// ============================================================
// XOR FILTER
// ============================================================

fn bench_bitxor_filter(c: &mut Criterion) {
    let cfg = black_box(bitxor3 {
        seed: 0xdeadbeefcafebabe,
        block_mask: 0xf,
    });
    let mut table = [0u32; 16];
    let key = black_box(42u32);
    let fp = bitxor_fingerprint32(key, cfg.seed);
    let i0 = bitxor_idx0(&cfg, key) as usize;
    let i1 = bitxor_idx1(&cfg, key) as usize;
    let i2 = bitxor_idx2(&cfg, key) as usize;
    table[i0] ^= fp;
    table[i1] ^= 0;
    table[i2] ^= 0;

    c.bench_function("bitxor_fingerprint32", |b| {
        b.iter(|| bitxor_fingerprint32(black_box(key), black_box(cfg.seed)))
    });

    c.bench_function("bitxor_contains_u32_hit", |b| {
        b.iter(|| bitxor_contains_u32(&cfg, &table, black_box(key)))
    });

    c.bench_function("bitxor_contains_u32_miss", |b| {
        b.iter(|| bitxor_contains_u32(&cfg, &table, black_box(999)))
    });
}

// ============================================================
// UNION-FIND
// ============================================================

fn bench_union_find(c: &mut Criterion) {
    let mut parent = [0u32, 1, 2, 3, 4, 5, 6, 7];

    c.bench_function("bituf_find_2_root", |b| {
        b.iter(|| bituf_find_2(&parent, black_box(0)))
    });

    c.bench_function("bituf_find_2_nonroot", |b| {
        b.iter(|| bituf_find_2(&parent, black_box(7)))
    });

    c.bench_function("bituf_union_by_min_2", |b| {
        b.iter(|| {
            bituf_union_by_min_2(&mut parent, black_box(2), black_box(3));
        })
    });
}

// ============================================================
// FENWICK TREE
// ============================================================

fn bench_fenwick(c: &mut Criterion) {
    let mut tree = [0u32; 8];

    c.bench_function("bitfenwick_add_8", |b| {
        b.iter(|| bitfenwick_add_8(&mut tree, black_box(1), black_box(5)))
    });

    c.bench_function("bitfenwick_sum_8", |b| {
        b.iter(|| bitfenwick_sum_8(&tree, black_box(4)))
    });
}

// ============================================================
// SPATIAL KERNELS
// ============================================================

fn bench_spatial(c: &mut Criterion) {
    let p1 = black_box(Point2 { x: 100, y: 200 });
    let p2 = black_box(Point2 { x: 110, y: 205 });

    c.bench_function("manhattan2", |b| {
        b.iter(|| manhattan2(p1, p2))
    });

    c.bench_function("dist2_sq", |b| {
        b.iter(|| dist2_sq(p1, p2))
    });

    let pts = black_box([
        Point2 { x: 100, y: 200 },
        Point2 { x: 50, y: 60 },
        Point2 { x: 200, y: 300 },
        Point2 { x: 110, y: 205 },
    ]);
    let target = black_box(Point2 { x: 105, y: 210 });

    c.bench_function("nearest_of4", |b| {
        b.iter(|| nearest_of4(target, pts))
    });
}

// ============================================================
// DECLARE CONSTRAINT KERNELS
// ============================================================

fn bench_declare(c: &mut Criterion) {
    c.bench_function("declare_response_seen", |b| {
        b.iter(|| declare_response_seen(black_box(1), black_box(1)))
    });

    c.bench_function("declare_precedence_ok", |b| {
        b.iter(|| declare_precedence_ok(black_box(1), black_box(1)))
    });

    c.bench_function("declare_absence_le_1", |b| {
        b.iter(|| declare_absence_le_1(black_box(0)))
    });

    c.bench_function("declare_existence_ge_1", |b| {
        b.iter(|| declare_existence_ge_1(black_box(1)))
    });
}

criterion_group!(
    benches,
    bench_ingress_decide_4,
    bench_ingress_decide_8,
    bench_construct8,
    bench_marking_ops,
    bench_bitwise_ops,
    bench_hashing,
    bench_bitxor_filter,
    bench_union_find,
    bench_fenwick,
    bench_spatial,
    bench_declare,
);

criterion_main!(benches);
