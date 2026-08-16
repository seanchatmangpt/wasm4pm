//! Bridge from `wasm4pm::models::OCEL` to the OC-DFG discovery algorithm.
//!
//! `wasm4pm::advanced::ocdfg::OCDFG::discover` already takes `&OCEL` directly,
//! so this needs no shape conversion — it just gives the CLI a stable,
//! `anyhow`-wrapped entry point matching the pattern used by the other
//! `*_bridge` modules in this directory.

use wasm4pm::advanced::ocdfg::OCDFG;
use wasm4pm::models::OCEL;

/// Discover an Object-Centric Directly-Follows Graph (one DFG per object
/// type) from an OCEL log.
pub fn discover_ocdfg(ocel: &OCEL) -> anyhow::Result<OCDFG> {
    Ok(OCDFG::discover(ocel))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::ocel_envelope::parse_ocel_tolerant;

    /// 3 events over 2 objects of different types (Order, Item):
    /// Order: Create -> Ship
    /// Item:  Create -> Pack
    const OCEL_JSON: &str = r#"{
        "eventTypes": ["Create", "Ship", "Pack"],
        "objectTypes": ["Order", "Item"],
        "events": [
            {"id": "e1", "type": "Create", "time": "2026-01-01T00:00:00Z", "attributes": {}, "relationships": [{"objectId": "order1", "qualifier": "creates"}]},
            {"id": "e2", "type": "Create", "time": "2026-01-01T00:01:00Z", "attributes": {}, "relationships": [{"objectId": "item1", "qualifier": "creates"}]},
            {"id": "e3", "type": "Pack",   "time": "2026-01-01T00:02:00Z", "attributes": {}, "relationships": [{"objectId": "item1", "qualifier": "packs"}]},
            {"id": "e4", "type": "Ship",   "time": "2026-01-01T00:03:00Z", "attributes": {}, "relationships": [{"objectId": "order1", "qualifier": "ships"}]}
        ],
        "objects": [
            {"id": "order1", "type": "Order", "attributes": {}},
            {"id": "item1", "type": "Item", "attributes": {}}
        ]
    }"#;

    /// Golden test: `OCDFG::discover` (used by this bridge) is now a thin
    /// wrapper over `wasm4pm::discovery::discover_ocel_dfg_per_type_pure`.
    /// This proves the consolidation didn't change the CLI bridge's output —
    /// `OCDFG::discover(&ocel).dfgs` must equal
    /// `discover_ocel_dfg_per_type_pure(&ocel)` exactly, on the same fixture
    /// used by `discovers_per_object_type_dfgs` above.
    #[test]
    fn ocdfg_discover_matches_canonical_per_type_pure() {
        let ocel = parse_ocel_tolerant(OCEL_JSON).expect("test OCEL should parse");

        let via_wrapper = OCDFG::discover(&ocel).dfgs;
        let via_canonical = wasm4pm::discovery::discover_ocel_dfg_per_type_pure(&ocel);

        assert_eq!(
            serde_json::to_value(&via_wrapper).unwrap(),
            serde_json::to_value(&via_canonical).unwrap(),
            "OCDFG::discover must match discover_ocel_dfg_per_type_pure exactly \
             (thin-wrapper consolidation must not change CLI bridge output)"
        );
    }

    #[test]
    fn discovers_per_object_type_dfgs() {
        let ocel = parse_ocel_tolerant(OCEL_JSON).expect("test OCEL should parse");
        let ocdfg = discover_ocdfg(&ocel).expect("discovery should succeed");

        println!("OCDFG discovered: {:#?}", ocdfg);

        assert_eq!(ocdfg.dfgs.len(), 2, "expected one DFG per object type");

        let order_dfg = ocdfg.dfgs.get("Order").expect("Order DFG present");
        assert_eq!(order_dfg.start_activities.get("Create"), Some(&1));
        assert_eq!(order_dfg.end_activities.get("Ship"), Some(&1));
        assert!(order_dfg
            .edges
            .iter()
            .any(|e| e.from == "Create" && e.to == "Ship" && e.frequency == 1));

        let item_dfg = ocdfg.dfgs.get("Item").expect("Item DFG present");
        assert_eq!(item_dfg.start_activities.get("Create"), Some(&1));
        assert_eq!(item_dfg.end_activities.get("Pack"), Some(&1));
        assert!(item_dfg
            .edges
            .iter()
            .any(|e| e.from == "Create" && e.to == "Pack" && e.frequency == 1));
    }
}
