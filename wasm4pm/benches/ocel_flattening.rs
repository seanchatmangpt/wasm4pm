/// Criterion benchmarks for OCEL many-to-many flattening throughput.
///
/// Measures how long `measure_flattening_loss` takes for three structural shapes:
///   1. `one_to_one`   — each event references exactly one object (no duplication)
///   2. `one_to_many`  — each event references N objects (1:N relationship)
///   3. `many_to_many` — events reference M objects, objects appear in multiple events
///
/// The `feature-ocel` feature is enabled by default (via the `browser` profile),
/// so no `required-features` guard is needed.  If compiled without `ocel`, the
/// `measure_flattening_loss` symbol will still exist (it is not cfg-gated at the
/// function-signature level) but the body may be a no-op.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::collections::HashMap;
use std::time::Duration;
use wasm4pm::models::{OCELEvent, OCELObject, OCEL};
use wasm4pm::ocel_flatten::measure_flattening_loss;

#[path = "helpers.rs"]
mod helpers;
use helpers::Lcg;

// ---------------------------------------------------------------------------
// OCEL factory functions
// ---------------------------------------------------------------------------

/// Build a 1-to-1 OCEL: each event references exactly one object.
///
/// Shape: `num_objects` objects of type "order", each with a private chain of
/// `events_per_object` events.  No event is shared between objects.
fn build_one_to_one_ocel(num_objects: usize, events_per_object: usize) -> OCEL {
    let mut events = Vec::with_capacity(num_objects * events_per_object);
    let mut objects = Vec::with_capacity(num_objects);
    let activities = ["Create", "Process", "Validate", "Approve", "Close"];

    let mut rng = Lcg::new(0xDEAD_BEEF);
    for obj_idx in 0..num_objects {
        let obj_id = format!("order{}", obj_idx);
        objects.push(OCELObject {
            id: obj_id.clone(),
            object_type: "order".to_string(),
            attributes: HashMap::new(),
            changes: vec![],
            embedded_relations: vec![],
        });
        for evt_idx in 0..events_per_object {
            let act = activities[rng.next_usize_mod(activities.len())];
            events.push(OCELEvent {
                id: format!("e_{}_{}", obj_idx, evt_idx),
                event_type: act.to_string(),
                timestamp: format!(
                    "2024-{:02}-{:02}T{:02}:00:00Z",
                    (obj_idx % 12) + 1,
                    (evt_idx % 28) + 1,
                    evt_idx % 24,
                ),
                attributes: HashMap::new(),
                object_ids: vec![obj_id.clone()],
                object_refs: vec![],
            });
        }
    }

    OCEL {
        event_types: activities.iter().map(|s| s.to_string()).collect(),
        object_types: vec!["order".to_string()],
        events,
        objects,
        object_relations: vec![],
    }
}

/// Build a 1-to-N OCEL: each event references `objects_per_event` objects.
///
/// Shape: `num_objects` objects of type "item"; `num_events` events each
/// reference `objects_per_event` consecutive items.  No single item is shared
/// across events (each item appears in exactly one event).
fn build_one_to_many_ocel(num_events: usize, objects_per_event: usize) -> OCEL {
    let num_objects = num_events * objects_per_event;
    let activities = ["Register", "Ship", "Deliver", "Return"];
    let mut rng = Lcg::new(0xCAFE_BABE);

    let objects: Vec<OCELObject> = (0..num_objects)
        .map(|i| OCELObject {
            id: format!("item{}", i),
            object_type: "item".to_string(),
            attributes: HashMap::new(),
            changes: vec![],
            embedded_relations: vec![],
        })
        .collect();

    let events: Vec<OCELEvent> = (0..num_events)
        .map(|evt_idx| {
            let act = activities[rng.next_usize_mod(activities.len())];
            let base = evt_idx * objects_per_event;
            OCELEvent {
                id: format!("ev{}", evt_idx),
                event_type: act.to_string(),
                timestamp: format!(
                    "2024-01-{:02}T{:02}:00:00Z",
                    (evt_idx % 28) + 1,
                    evt_idx % 24,
                ),
                attributes: HashMap::new(),
                object_ids: (base..base + objects_per_event)
                    .map(|i| format!("item{}", i))
                    .collect(),
                object_refs: vec![],
            }
        })
        .collect();

    OCEL {
        event_types: activities.iter().map(|s| s.to_string()).collect(),
        object_types: vec!["item".to_string()],
        events,
        objects,
        object_relations: vec![],
    }
}

/// Build a many-to-many OCEL: M objects × N events, where each event references
/// `fanout_out` objects and each object appears in `fanout_in` events.
///
/// Shape: a grid of `num_objects` × `num_events`.  Event `e` references objects
/// at indices `e*fanout .. e*fanout + fanout` (mod num_objects) to ensure every
/// object has approximately `fanout_in` events.
fn build_many_to_many_ocel(num_objects: usize, num_events: usize, fanout: usize) -> OCEL {
    let activities = ["A", "B", "C", "D", "E"];
    let mut rng = Lcg::new(0x1234_ABCD);

    let objects: Vec<OCELObject> = (0..num_objects)
        .map(|i| OCELObject {
            id: format!("obj{}", i),
            object_type: "process".to_string(),
            attributes: HashMap::new(),
            changes: vec![],
            embedded_relations: vec![],
        })
        .collect();

    let events: Vec<OCELEvent> = (0..num_events)
        .map(|evt_idx| {
            let act = activities[rng.next_usize_mod(activities.len())];
            // Each event fans out to `fanout` objects (modulo num_objects)
            let object_ids: Vec<String> = (0..fanout)
                .map(|k| format!("obj{}", (evt_idx * fanout + k) % num_objects))
                .collect();
            OCELEvent {
                id: format!("e{}", evt_idx),
                event_type: act.to_string(),
                timestamp: format!(
                    "2024-01-{:02}T{:02}:00:00Z",
                    (evt_idx % 28) + 1,
                    evt_idx % 24,
                ),
                attributes: HashMap::new(),
                object_ids,
                object_refs: vec![],
            }
        })
        .collect();

    OCEL {
        event_types: activities.iter().map(|s| s.to_string()).collect(),
        object_types: vec!["process".to_string()],
        events,
        objects,
        object_relations: vec![],
    }
}

// ---------------------------------------------------------------------------
// Group 1: One-to-one OCEL flattening
// ---------------------------------------------------------------------------

fn bench_ocel_one_to_one(c: &mut Criterion) {
    let mut group = c.benchmark_group("ocel_flattening/one_to_one");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    // Sweep over (num_objects, events_per_object) combinations
    let configs: &[(usize, usize)] = &[(50, 5), (200, 10), (500, 15), (1_000, 20)];

    for &(num_objects, events_per_object) in configs {
        let ocel = build_one_to_one_ocel(num_objects, events_per_object);
        let total_events = ocel.events.len() as u64;

        group.throughput(Throughput::Elements(total_events));
        group.bench_with_input(
            BenchmarkId::new("objects", num_objects),
            &ocel,
            |b, o| b.iter(|| measure_flattening_loss(o, "order")),
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 2: One-to-many OCEL flattening
// ---------------------------------------------------------------------------

fn bench_ocel_one_to_many(c: &mut Criterion) {
    let mut group = c.benchmark_group("ocel_flattening/one_to_many");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    // (num_events, objects_per_event) — objects_per_event is the N in 1:N
    let configs: &[(usize, usize)] = &[(50, 3), (200, 5), (500, 8), (1_000, 10)];

    for &(num_events, objects_per_event) in configs {
        let ocel = build_one_to_many_ocel(num_events, objects_per_event);
        let total_events = ocel.events.len() as u64;

        group.throughput(Throughput::Elements(total_events));
        group.bench_with_input(
            BenchmarkId::new("events", num_events),
            &ocel,
            |b, o| b.iter(|| measure_flattening_loss(o, "item")),
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Group 3: Many-to-many OCEL flattening
// ---------------------------------------------------------------------------

fn bench_ocel_many_to_many(c: &mut Criterion) {
    let mut group = c.benchmark_group("ocel_flattening/many_to_many");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    // (num_objects, num_events, fanout)
    let configs: &[(usize, usize, usize)] = &[
        (20, 50, 3),
        (50, 200, 5),
        (100, 500, 8),
        (200, 1_000, 10),
    ];

    for &(num_objects, num_events, fanout) in configs {
        let ocel = build_many_to_many_ocel(num_objects, num_events, fanout);
        let total_events = ocel.events.len() as u64;

        group.throughput(Throughput::Elements(total_events));
        group.bench_with_input(
            BenchmarkId::new("events", num_events),
            &ocel,
            |b, o| b.iter(|| measure_flattening_loss(o, "process")),
        );
    }
    group.finish();
}

criterion_group!(
    ocel_flattening_benches,
    bench_ocel_one_to_one,
    bench_ocel_one_to_many,
    bench_ocel_many_to_many,
);
criterion_main!(ocel_flattening_benches);
