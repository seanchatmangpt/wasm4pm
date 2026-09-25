// Integration tests for cache-efficient data structures
// Run with: cargo test --test cache_resident_tests

use wasm4pm::cache_resident::{
    decode_rl_state, encode_rl_state, ActionRecommendation, CycleSnapshot, QEntry, QTable,
    VariantEntry, VariantMap,
};
use wasm4pm::RlState;

#[test]
fn test_state_encoding_decode_roundtrip() {
    let state = RlState {
        health_level: 2,
        event_rate_q: 5,
        activity_count_q: 3,
        spc_alert_level: 1,
        drift_status: 2,
        rework_ratio_q: 7,
        circuit_state: 1,
        cycle_phase: 3,
    };

    let idx = encode_rl_state(&state);
    let decoded = decode_rl_state(idx);

    assert_eq!(decoded.health_level, state.health_level);
    assert_eq!(decoded.event_rate_q, state.event_rate_q);
    assert_eq!(decoded.activity_count_q, state.activity_count_q);
    assert_eq!(decoded.spc_alert_level, state.spc_alert_level);
    assert_eq!(decoded.drift_status, state.drift_status);
    assert_eq!(decoded.rework_ratio_q, state.rework_ratio_q);
    assert_eq!(decoded.circuit_state, state.circuit_state);
    assert_eq!(decoded.cycle_phase, state.cycle_phase);
}

#[test]
fn test_state_encoding_bounds() {
    // Test all corner cases
    let state_min = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };
    let idx_min = encode_rl_state(&state_min);
    assert_eq!(idx_min, 0);

    let state_max = RlState {
        health_level: 4,
        event_rate_q: 7,
        activity_count_q: 7,
        spc_alert_level: 3,
        drift_status: 2,
        rework_ratio_q: 7,
        circuit_state: 2,
        cycle_phase: 3,
    };
    let idx_max = encode_rl_state(&state_max);
    assert!(idx_max < 460_800, "Index out of bounds: {}", idx_max);
}

#[test]
fn test_qtable_sequential_inserts() {
    let mut table: QTable<10_000> = QTable::new();

    for i in 0..1000 {
        table.insert(i as u32, (i % 8) as u8, 0.5 + (i as f32) * 0.001);
    }

    // Verify all inserts succeeded
    for i in 0..1000 {
        let q = table.get(i as u32, (i % 8) as u8);
        assert!(q.is_some(), "Failed to retrieve entry {}", i);
    }
}

#[test]
fn test_qtable_update_overwrites() {
    let mut table: QTable<1000> = QTable::new();

    table.insert(100, 0, 0.5);
    assert_eq!(table.get(100, 0), Some(0.5));

    table.insert(100, 0, 0.75);
    assert_eq!(table.get(100, 0), Some(0.75));
}

#[test]
fn test_qtable_missing_entries() {
    let table: QTable<1000> = QTable::new();

    assert_eq!(table.get(999, 7), None);
    assert_eq!(table.get(0, 0), None);
}

#[test]
fn test_qtable_get_or_insert_default() {
    let mut table: QTable<1000> = QTable::new();

    let q1 = table.get_or_insert_default(100, 0);
    assert_eq!(q1, 0.0);

    let q2 = table.get_or_insert_default(100, 0);
    assert_eq!(q2, 0.0);

    // Verify it's actually stored
    assert_eq!(table.get(100, 0), Some(0.0));
}

#[test]
fn test_qtable_load_factor() {
    let mut table: QTable<1000> = QTable::new();

    // Empty table
    assert!(table.load_factor() < 0.01);

    // Insert 100 entries
    for i in 0..100 {
        table.insert(i as u32, (i % 8) as u8, 0.5);
    }

    let load = table.load_factor();
    assert!(
        load > 0.05 && load < 0.20,
        "Unexpected load factor: {}",
        load
    );
}

#[test]
fn test_variant_map_insert_get() {
    let mut map = VariantMap::with_capacity(1000);

    map.insert(12345, 5);
    assert_eq!(map.get(12345), Some(5));
}

#[test]
fn test_variant_map_increment() {
    let mut map = VariantMap::with_capacity(1000);

    map.insert(12345, 5);
    map.insert(12345, 3);
    assert_eq!(map.get(12345), Some(8));

    map.insert(12345, 2);
    assert_eq!(map.get(12345), Some(10));
}

#[test]
fn test_variant_map_multiple_keys() {
    let mut map = VariantMap::with_capacity(10000);

    for i in 0..1000 {
        let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
        map.insert(fp, (i % 10 + 1) as u32);
    }

    for i in 0..1000 {
        let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
        assert_eq!(map.get(fp), Some((i % 10 + 1) as u32));
    }
}

#[test]
fn test_variant_map_missing() {
    let map = VariantMap::with_capacity(1000);
    assert_eq!(map.get(99999), None);
}

#[test]
fn test_cache_alignment_qentry() {
    assert_eq!(std::mem::align_of::<QEntry>(), 64);
    assert_eq!(std::mem::size_of::<QEntry>(), 64);
}

#[test]
fn test_cache_alignment_cycle_snapshot() {
    assert_eq!(std::mem::align_of::<CycleSnapshot>(), 64);
    assert_eq!(std::mem::size_of::<CycleSnapshot>(), 64);
}

#[test]
fn test_cache_alignment_action_recommendation() {
    assert_eq!(std::mem::align_of::<ActionRecommendation>(), 64);
    assert_eq!(std::mem::size_of::<ActionRecommendation>(), 64);
}

#[test]
fn test_cache_alignment_variant_entry() {
    assert_eq!(std::mem::align_of::<VariantEntry>(), 64);
    assert_eq!(std::mem::size_of::<VariantEntry>(), 64);
}

#[test]
fn test_qtable_full_memory_size() {
    let table: QTable<460_800> = QTable::new();
    let size_bytes = table.size_bytes();
    let size_mb = size_bytes as f64 / (1024.0 * 1024.0);

    println!("QTable<460_800> size: {:.2} MB", size_mb);
    assert!(size_mb < 36.0, "QTable exceeds 36MB: {:.2}MB", size_mb);
}

#[test]
fn test_state_encoding_all_states_unique() {
    // Spot check that different states produce different indices
    let mut indices = std::collections::HashSet::new();

    for health in 0..5 {
        for event_rate in 0..8 {
            for activity in 0..3 {
                let state = RlState {
                    health_level: health,
                    event_rate_q: event_rate,
                    activity_count_q: activity,
                    spc_alert_level: 0,
                    drift_status: 0,
                    rework_ratio_q: 0,
                    circuit_state: 0,
                    cycle_phase: 0,
                };
                let idx = encode_rl_state(&state);
                assert!(
                    indices.insert(idx),
                    "Duplicate index for state: {:?}",
                    state
                );
            }
        }
    }

    assert!(
        indices.len() > 100,
        "Expected >100 unique indices, got {}",
        indices.len()
    );
}

#[test]
fn test_variant_map_load_factor() {
    let mut map = VariantMap::with_capacity(1000);

    for i in 0..100 {
        let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
        map.insert(fp, 1);
    }

    let load = map.load_factor();
    assert!(
        load > 0.05 && load < 0.15,
        "Unexpected load factor: {}",
        load
    );
}

#[test]
fn test_qtable_clear() {
    let mut table: QTable<1000> = QTable::new();

    table.insert(100, 0, 0.5);
    table.insert(200, 1, 0.75);

    assert_eq!(table.get(100, 0), Some(0.5));
    assert_eq!(table.get(200, 1), Some(0.75));

    table.clear();

    assert_eq!(table.get(100, 0), None);
    assert_eq!(table.get(200, 1), None);
}

#[test]
fn test_variant_map_clear() {
    let mut map = VariantMap::with_capacity(1000);

    map.insert(12345, 5);
    map.insert(67890, 10);

    assert_eq!(map.get(12345), Some(5));
    assert_eq!(map.get(67890), Some(10));

    map.clear();

    assert_eq!(map.get(12345), None);
    assert_eq!(map.get(67890), None);
}

#[test]
fn test_sequential_access_pattern() {
    // Simulate sequential access (high cache locality)
    let mut table: QTable<10_000> = QTable::new();

    // Insert in sequential order
    for i in 0..1000 {
        table.insert(i as u32, 0, (i as f32) * 0.1);
    }

    // Read in sequential order
    let mut sum = 0.0;
    for i in 0..1000 {
        if let Some(q) = table.get(i as u32, 0) {
            sum += q;
        }
    }

    assert!(sum > 0.0, "Sequential scan failed");
}

#[test]
fn test_collision_handling() {
    // Test with a smaller table to force collisions
    let mut table: QTable<100> = QTable::new();

    // These will likely collide
    table.insert(0, 0, 0.1);
    table.insert(1, 0, 0.2);
    table.insert(2, 0, 0.3);
    table.insert(3, 0, 0.4);

    // All should be retrievable despite collisions
    assert_eq!(table.get(0, 0), Some(0.1));
    assert_eq!(table.get(1, 0), Some(0.2));
    assert_eq!(table.get(2, 0), Some(0.3));
    assert_eq!(table.get(3, 0), Some(0.4));
}
