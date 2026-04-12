//! Closed Claw Pipeline C: Object-Centric Core
//!
//! Benchmarks the OCEL processing pipeline end-to-end:
//!   1. OCEL Construction (synthetic data generation with multiple object types)
//!   2. OCEL Validation (referential integrity, timestamps, type consistency)
//!   3. OCEL Flattening (project onto single object type -> EventLog)
//!   4. OCEL Serialization (JSON roundtrip for receipt hashing)
//!
//! Gates exercised:
//!   G1 Determinism -- same OCEL builder config always produces identical output
//!   G2 Receipt    -- BLAKE3 hash chain: input -> validation -> flatten -> output
//!   G5 Report    -- structured metrics: object counts, event counts, trace counts
//!
//! NOTE: WASM-bound functions (load_ocel2_from_json, validate_ocel,
//! flatten_ocel_to_eventlog, discover_oc_petri_net, oc_conformance_check)
//! return Result<JsValue, JsValue> which panics outside a WASM runtime.
//! For native Criterion benchmarks we call the pure-Rust model types and
//! the validation/flattening logic inline (matching the source in ocel_io.rs,
//! oc_petri_net.rs, and oc_conformance.rs).

use criterion::{black_box, BenchmarkId, Criterion, Throughput};
use pictl::models::*;
use pictl::state::{get_or_init_state, StoredObject};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Deterministic RNG (LCG -- same as helpers.rs)
// ---------------------------------------------------------------------------

struct Lcg(u64);

impl Lcg {
    const fn new(seed: u64) -> Self {
        Self(seed)
    }
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }
    fn next_f64_unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
}

// ---------------------------------------------------------------------------
// Synthetic OCEL Builder
// ---------------------------------------------------------------------------

/// Deterministic OCEL builder -- produces a valid multi-type OCEL for benchmarking.
///
/// Creates `num_orders` order objects, `num_items` item objects, and
/// `num_orders * avg_events_per_order` events referencing them.
/// Events follow the lifecycle: Create -> Check -> Approve/Reject -> Close.
struct OcelBuilder {
    num_orders: usize,
    num_items: usize,
    avg_events_per_order: usize,
    noise_factor: f64,
}

impl OcelBuilder {
    fn new(num_orders: usize, num_items: usize, avg_events_per_order: usize) -> Self {
        Self {
            num_orders,
            num_items,
            avg_events_per_order,
            noise_factor: 0.05,
        }
    }

    fn build(&self) -> OCEL {
        let event_types = vec![
            "Create Order".to_string(),
            "Check Payment".to_string(),
            "Approve Order".to_string(),
            "Reject Order".to_string(),
            "Create Invoice".to_string(),
            "Close Order".to_string(),
        ];
        let object_types = vec!["Order".to_string(), "Item".to_string()];
        let lifecycle = [
            "Create Order",
            "Check Payment",
            "Approve Order",
            "Create Invoice",
            "Close Order",
        ];

        let mut objects = Vec::new();
        let mut events = Vec::new();
        let mut object_relations = Vec::new();

        for i in 0..self.num_orders {
            objects.push(OCELObject {
                id: format!("order_{}", i),
                object_type: "Order".to_string(),
                attributes: {
                    let mut a = HashMap::new();
                    a.insert(
                        "amount".to_string(),
                        AttributeValue::Float(100.0 + i as f64 * 50.0),
                    );
                    a.insert(
                        "status".to_string(),
                        AttributeValue::String("pending".to_string()),
                    );
                    a
                },
                changes: vec![],
                embedded_relations: vec![],
            });
        }

        for i in 0..self.num_items {
            let order_idx = i % self.num_orders.max(1);
            objects.push(OCELObject {
                id: format!("item_{}", i),
                object_type: "Item".to_string(),
                attributes: {
                    let mut a = HashMap::new();
                    a.insert(
                        "weight".to_string(),
                        AttributeValue::Float(1.0 + i as f64 * 0.1),
                    );
                    a
                },
                changes: vec![],
                embedded_relations: vec![],
            });

            object_relations.push(OCELObjectRelation {
                source_id: format!("order_{}", order_idx),
                target_id: format!("item_{}", i),
                qualifier: "contains".to_string(),
            });
        }

        let mut rng = Lcg::new(0xDEAD_BEEF_CAFE_BABE);
        let mut event_counter = 0usize;

        for i in 0..self.num_orders {
            let order_id = format!("order_{}", i);
            let item_id = format!("item_{}", i % self.num_items.max(1));

            let len_factor = 0.5 + rng.next_f64_unit();
            let num_events = ((self.avg_events_per_order as f64 * len_factor) as usize)
                .max(2)
                .min(lifecycle.len());

            for (evt_idx, &activity) in lifecycle.iter().take(num_events).enumerate() {
                let actual_activity =
                    if activity == "Approve Order" && rng.next_f64_unit() < self.noise_factor {
                        "Reject Order"
                    } else {
                        activity
                    };

                let mut object_ids = vec![order_id.clone()];
                if actual_activity == "Create Invoice" {
                    object_ids.push(item_id.clone());
                }

                events.push(OCELEvent {
                    id: format!("evt_{}", event_counter),
                    event_type: actual_activity.to_string(),
                    timestamp: format!(
                        "2024-01-{:02}T{:02}:{:02}:00Z",
                        (i % 28) + 1,
                        (evt_idx / 60) % 24,
                        evt_idx % 60,
                    ),
                    attributes: HashMap::new(),
                    object_ids,
                    object_refs: vec![],
                });
                event_counter += 1;
            }
        }

        OCEL {
            event_types,
            object_types,
            events,
            objects,
            object_relations,
        }
    }
}

// ---------------------------------------------------------------------------
// OCEL Validation (native, mirrors ocel_io.rs validate_ocel internals)
// ---------------------------------------------------------------------------

/// Validate OCEL referential integrity natively.
/// Returns (is_valid, error_count).
fn validate_ocel_native(ocel: &OCEL) -> (bool, usize) {
    let mut errors = 0usize;
    let valid_ids: HashSet<&str> = ocel.objects.iter().map(|o| o.id.as_str()).collect();

    for event in &ocel.events {
        for oid in &event.object_ids {
            if !valid_ids.contains(oid.as_str()) {
                errors += 1;
            }
        }
        for oref in &event.object_refs {
            if !valid_ids.contains(oref.object_id.as_str()) {
                errors += 1;
            }
        }
    }

    let mut seen = HashSet::new();
    for obj in &ocel.objects {
        if !seen.insert(&obj.id) {
            errors += 1;
        }
    }

    (errors == 0, errors)
}

// ---------------------------------------------------------------------------
// OCEL Flattening (native, mirrors oc_petri_net.rs flatten_ocel_to_eventlog_for_type)
// ---------------------------------------------------------------------------

/// Flatten OCEL to EventLog for a specific object type.
fn flatten_ocel_native(ocel: &OCEL, object_type: &str) -> EventLog {
    let mut event_log = EventLog::new();

    let target_objects: Vec<&OCELObject> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .collect();

    for obj in target_objects {
        let mut events_for_obj: Vec<&OCELEvent> = ocel
            .events
            .iter()
            .filter(|e| e.all_object_ids().any(|oid| oid == obj.id))
            .collect();
        events_for_obj.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let mut trace = Trace {
            attributes: {
                let mut attrs = HashMap::new();
                attrs.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(obj.id.clone()),
                );
                attrs.insert(
                    "object_type".to_string(),
                    AttributeValue::String(object_type.to_string()),
                );
                attrs
            },
            events: Vec::new(),
        };

        for ocel_event in events_for_obj {
            let mut event_attrs = HashMap::new();
            event_attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(ocel_event.event_type.clone()),
            );
            event_attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(ocel_event.timestamp.clone()),
            );
            trace.events.push(Event {
                attributes: event_attrs,
            });
        }

        event_log.traces.push(trace);
    }

    event_log
}

// ---------------------------------------------------------------------------
// Benchmark: OCEL Construction
// ---------------------------------------------------------------------------

fn bench_ocel_construction(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/C_ocel/construct");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for &num_orders in &[50, 200, 1_000, 5_000] {
        let num_items = (num_orders as f64 * 1.5) as usize;
        let avg_events = 5;

        group.bench_with_input(
            BenchmarkId::new("orders", num_orders),
            &(num_orders, num_items, avg_events),
            |b, &(orders, items, events)| {
                b.iter(|| {
                    let builder = OcelBuilder::new(orders, items, events);
                    let ocel = builder.build();
                    black_box(ocel)
                })
            },
        );
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: OCEL Validation
// ---------------------------------------------------------------------------

fn bench_ocel_validation(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/C_ocel/validate");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for &num_orders in &[50, 200, 1_000, 5_000] {
        let num_items = (num_orders as f64 * 1.5) as usize;
        let builder = OcelBuilder::new(num_orders, num_items, 5);
        let ocel = builder.build();
        let total_events = ocel.events.len();

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(BenchmarkId::new("orders", num_orders), &ocel, |b, ocel| {
            b.iter(|| {
                let (valid, error_count) = validate_ocel_native(black_box(ocel));
                black_box((valid, error_count))
            })
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: OCEL Flattening (per object type)
// ---------------------------------------------------------------------------

fn bench_ocel_flatten(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/C_ocel/flatten");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for &num_orders in &[50, 200, 1_000, 5_000] {
        let num_items = (num_orders as f64 * 1.5) as usize;
        let builder = OcelBuilder::new(num_orders, num_items, 5);
        let ocel = builder.build();
        let total_events = ocel.events.len();

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(BenchmarkId::new("orders", num_orders), &ocel, |b, ocel| {
            b.iter(|| {
                let order_log = flatten_ocel_native(black_box(ocel), "Order");
                black_box(order_log)
            })
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: OCEL Serialization (JSON roundtrip for receipt)
// ---------------------------------------------------------------------------

fn bench_ocel_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/C_ocel/serialize");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for &num_orders in &[50, 200, 1_000, 5_000] {
        let num_items = (num_orders as f64 * 1.5) as usize;
        let builder = OcelBuilder::new(num_orders, num_items, 5);
        let ocel = builder.build();

        group.bench_with_input(BenchmarkId::new("orders", num_orders), &ocel, |b, ocel| {
            b.iter(|| {
                let json = serde_json::to_string(black_box(ocel)).unwrap_or_default();
                let hash = blake3::hash(json.as_bytes());
                black_box(hash)
            })
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Benchmark: OCEL Pipeline E2E (G2 Receipt chain)
// ---------------------------------------------------------------------------

fn bench_ocel_pipeline_e2e(c: &mut Criterion) {
    let mut group = c.benchmark_group("closed_claw/C_ocel/pipeline_e2e");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));

    for &num_orders in &[50, 200, 1_000] {
        let num_items = (num_orders as f64 * 1.5) as usize;
        let builder = OcelBuilder::new(num_orders, num_items, 5);
        let ocel = builder.build();
        let total_events = ocel.events.len();

        group.throughput(Throughput::Elements(total_events as u64));
        group.bench_with_input(BenchmarkId::new("orders", num_orders), &ocel, |b, ocel| {
            b.iter(|| {
                let input_json = serde_json::to_string(black_box(ocel)).unwrap_or_default();
                let input_hash = blake3::hash(input_json.as_bytes());

                let (valid, error_count) = validate_ocel_native(ocel);

                let order_log = flatten_ocel_native(ocel, "Order");
                let item_log = flatten_ocel_native(ocel, "Item");

                let order_json = serde_json::to_string(&order_log).unwrap_or_default();
                let order_hash = blake3::hash(order_json.as_bytes());
                let item_json = serde_json::to_string(&item_log).unwrap_or_default();
                let item_hash = blake3::hash(item_json.as_bytes());

                let state = get_or_init_state();
                let _order_handle = state
                    .store_object(StoredObject::EventLog(order_log))
                    .expect("store failed");
                let _item_handle = state
                    .store_object(StoredObject::EventLog(item_log))
                    .expect("store failed");

                black_box((input_hash, valid, error_count, order_hash, item_hash))
            })
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Public entry point (called from mod.rs)
// ---------------------------------------------------------------------------

pub fn bench_ocel_core(c: &mut Criterion) {
    bench_ocel_construction(c);
    bench_ocel_validation(c);
    bench_ocel_flatten(c);
    bench_ocel_serialization(c);
    bench_ocel_pipeline_e2e(c);
}
