//! OCEL exporter for test evidence

use serde_json::{json, Value};

pub fn export_ocel(events: &[crate::testing::TestEvent], route_id: &str) -> Value {
    let event_objs: Vec<Value> = events
        .iter()
        .map(|e| json!({ "type": e.activity, "object_ids": e.object_ids }))
        .collect();
    
    json!({
        "ocelVersion": "2.0",
        "routeId": route_id,
        "events": event_objs
    })
}
