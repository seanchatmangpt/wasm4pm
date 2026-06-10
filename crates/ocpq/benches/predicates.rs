use criterion::{criterion_group, criterion_main, Criterion, Throughput};
use ocpq::{
    evaluate_constraint, BasicPredicate, Binding, BindingBox, ChildSet, ConstraintPredicate, Edge,
    Node, QueryTree, VarDecl, VarKind,
};
use wasm4pm_compat::ocel::{OCELEvent, OCELObject, OCELRelationship, OCELType, OCEL};

// ---------------------------------------------------------------------------
// Helpers — minimal OCEL fixture
// ---------------------------------------------------------------------------

fn minimal_log() -> OCEL {
    // One event "e1" of type "place_order", linked to object "o1" of type "order"
    // via qualifier "main".
    OCEL {
        event_types: vec![OCELType {
            name: "place_order".into(),
            attributes: vec![],
        }],
        object_types: vec![OCELType {
            name: "order".into(),
            attributes: vec![],
        }],
        events: vec![OCELEvent {
            id: "e1".into(),
            event_type: "place_order".into(),
            time: "2024-01-01T00:00:00+00:00".parse().unwrap(),
            attributes: vec![],
            relationships: vec![OCELRelationship {
                object_id: "o1".into(),
                qualifier: "main".into(),
            }],
        }],
        objects: vec![OCELObject {
            id: "o1".into(),
            object_type: "order".into(),
            attributes: vec![],
            relationships: vec![],
        }],
    }
}

// ---------------------------------------------------------------------------
// bench_binding
// ---------------------------------------------------------------------------

fn bench_binding(c: &mut Criterion) {
    let mut group = c.benchmark_group("binding");
    group.throughput(Throughput::Elements(1));

    group.bench_function("construction", |b| {
        b.iter(|| {
            Binding::empty()
                .with("e1", "ev-001")
                .with("o1", "obj-001")
                .with("o2", "obj-002")
        });
    });

    // compatible: parent is a strict subset of child → refines = true
    let parent = Binding::empty().with("e1", "ev-001").with("o1", "obj-001");
    let child_compat = Binding::empty()
        .with("e1", "ev-001")
        .with("o1", "obj-001")
        .with("o2", "obj-002");

    group.bench_function("refines_compatible", |b| {
        b.iter(|| parent.refines(&child_compat));
    });

    // incompatible: child disagrees on "e1" → refines = false
    let child_incompat = Binding::empty()
        .with("e1", "ev-999") // different id
        .with("o1", "obj-001")
        .with("o2", "obj-002");

    group.bench_function("refines_incompatible", |b| {
        b.iter(|| parent.refines(&child_incompat));
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// bench_var_decl
// ---------------------------------------------------------------------------

fn bench_var_decl(c: &mut Criterion) {
    let mut group = c.benchmark_group("var_decl");
    group.throughput(Throughput::Elements(1));

    let decl_typed = VarDecl {
        name: "o1".into(),
        kind: VarKind::Object,
        types: vec!["order".into(), "item".into(), "package".into()],
    };

    let decl_any = VarDecl {
        name: "e1".into(),
        kind: VarKind::Event,
        types: vec![],
    };

    group.bench_function("admits_type_match", |b| {
        b.iter(|| decl_typed.admits_type("order"));
    });

    group.bench_function("admits_type_no_match", |b| {
        b.iter(|| decl_typed.admits_type("customer"));
    });

    group.bench_function("admits_type_any", |b| {
        b.iter(|| decl_any.admits_type("anything"));
    });

    group.finish();
}

// ---------------------------------------------------------------------------
// bench_constraint
// ---------------------------------------------------------------------------

fn bench_constraint(c: &mut Criterion) {
    let mut group = c.benchmark_group("constraint");
    group.throughput(Throughput::Elements(1));

    let log = minimal_log();

    // A single-node query tree: one event variable "e1" of type "place_order",
    // one object variable "o1" of type "order", constrained by E2O(e1, o1, "main").
    let bbox = BindingBox {
        vars: vec![
            VarDecl {
                name: "e1".into(),
                kind: VarKind::Event,
                types: vec!["place_order".into()],
            },
            VarDecl {
                name: "o1".into(),
                kind: VarKind::Object,
                types: vec!["order".into()],
            },
        ],
        preds: vec![],
    };

    // Satisfied tree: constr = E2O(e1, o1, "main") — the log has this edge.
    let tree_satisfied = QueryTree {
        root: "root".into(),
        nodes: vec![Node {
            id: "root".into(),
            bbox: bbox.clone(),
            children: vec![],
            constr: vec![ConstraintPredicate::Basic(BasicPredicate::E2O {
                event: "e1".into(),
                object: "o1".into(),
                qualifier: Some("main".into()),
            })],
        }],
    };

    // Violated tree: constr = E2O(e1, o1, "missing_qualifier") — no such edge.
    let tree_violated = QueryTree {
        root: "root".into(),
        nodes: vec![Node {
            id: "root".into(),
            bbox: bbox.clone(),
            children: vec![],
            constr: vec![ConstraintPredicate::Basic(BasicPredicate::E2O {
                event: "e1".into(),
                object: "o1".into(),
                qualifier: Some("missing_qualifier".into()),
            })],
        }],
    };

    group.bench_function("evaluate_satisfied", |b| {
        b.iter(|| evaluate_constraint(&tree_satisfied, &log));
    });

    group.bench_function("evaluate_violated", |b| {
        b.iter(|| evaluate_constraint(&tree_violated, &log));
    });

    group.finish();
}

criterion_group!(benches, bench_binding, bench_var_decl, bench_constraint);
criterion_main!(benches);
