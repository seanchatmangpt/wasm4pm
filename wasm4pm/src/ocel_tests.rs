//! OCEL (Object-Centric Event Log) tests
//!
//! Tests for OCEL 2.0 loading, validation, flattening, and analysis.

#[cfg(test)]
mod tests {
    use crate::models::{AttributeValue, OCELEvent, OCELObject, OCEL};
    use crate::state::{get_or_init_state, StoredObject};
    use serde_json::json;

    fn create_test_ocel() -> OCEL {
        OCEL {
            event_types: vec!["Order Created".to_string(), "Payment".to_string()],
            object_types: vec![
                "Order".to_string(),
                "Item".to_string(),
                "Customer".to_string(),
            ],
            events: vec![
                OCELEvent {
                    id: "e1".to_string(),
                    event_type: "Order Created".to_string(),
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: {
                        let mut attrs = std::collections::HashMap::new();
                        attrs.insert("amount".to_string(), AttributeValue::Float(100.0));
                        attrs
                    },
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e2".to_string(),
                    event_type: "Payment".to_string(),
                    timestamp: "2024-01-01T11:00:00Z".to_string(),
                    attributes: std::collections::HashMap::new(),
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "Order".to_string(),
                attributes: {
                    let mut attrs = std::collections::HashMap::new();
                    attrs.insert(
                        "status".to_string(),
                        AttributeValue::String("pending".to_string()),
                    );
                    attrs
                },
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        }
    }

    #[test]
    fn test_ocel_creation() {
        let ocel = create_test_ocel();
        assert_eq!(ocel.events.len(), 2);
        assert_eq!(ocel.objects.len(), 1);
        assert_eq!(ocel.event_types.len(), 2);
        assert_eq!(ocel.object_types.len(), 3);
    }

    #[test]
    fn test_ocel_store_and_retrieve() {
        let ocel = create_test_ocel();

        // Store OCEL in state
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        // Retrieve OCEL from state
        get_or_init_state()
            .with_object(&handle, |obj| {
                match obj {
                    Some(StoredObject::OCEL(retrieved)) => {
                        assert_eq!(retrieved.events.len(), 2);
                        assert_eq!(retrieved.objects.len(), 1);
                        assert_eq!(retrieved.events[0].id, "e1");
                    }
                    _ => panic!("Expected OCEL object"),
                }
                Ok(())
            })
            .expect("Failed to retrieve OCEL")
    }

    #[test]
    fn test_ocel_serialization() {
        let ocel = create_test_ocel();

        // Serialize to JSON
        let json_str = serde_json::to_string(&ocel).expect("Failed to serialize OCEL");
        assert!(json_str.contains("e1"));
        assert!(json_str.contains("Order Created"));

        // Deserialize from JSON
        let deserialized: OCEL =
            serde_json::from_str(&json_str).expect("Failed to deserialize OCEL");
        assert_eq!(deserialized.events.len(), 2);
        assert_eq!(deserialized.objects.len(), 1);
    }

    #[test]
    fn test_ocel_validation_valid() {
        let ocel = create_test_ocel();

        // Build object ID set for validation
        let object_ids: std::collections::HashSet<String> =
            ocel.objects.iter().map(|o| o.id.clone()).collect();

        // All event object references should be valid
        for event in &ocel.events {
            for obj_id in &event.object_ids {
                assert!(
                    object_ids.contains(obj_id),
                    "Event {} references non-existent object {}",
                    event.id,
                    obj_id
                );
            }
        }
    }

    #[test]
    fn test_ocel_all_object_ids() {
        let event = OCELEvent {
            id: "e1".to_string(),
            event_type: "Test".to_string(),
            timestamp: "2024-01-01T10:00:00Z".to_string(),
            attributes: std::collections::HashMap::new(),
            object_ids: vec!["obj1".to_string(), "obj2".to_string()],
            object_refs: vec![],
        };

        let ids: Vec<&str> = event.all_object_ids().collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"obj1"));
        assert!(ids.contains(&"obj2"));
    }

    #[test]
    fn test_ocel_with_object_refs() {
        use crate::models::OCELEventObjectRef;

        let event = OCELEvent {
            id: "e1".to_string(),
            event_type: "Test".to_string(),
            timestamp: "2024-01-01T10:00:00Z".to_string(),
            attributes: std::collections::HashMap::new(),
            object_ids: vec!["obj1".to_string()],
            object_refs: vec![OCELEventObjectRef {
                object_id: "obj2".to_string(),
                qualifier: "item".to_string(),
            }],
        };

        let ids: Vec<&str> = event.all_object_ids().collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"obj1"));
        assert!(ids.contains(&"obj2"));
    }

    #[test]
    fn test_ocel_json_parsing() {
        let ocel_json = json!({
            "eventTypes": ["A", "B"],
            "objectTypes": ["X", "Y"],
            "events": [
                {
                    "id": "e1",
                    "type": "A",
                    "time": "2024-01-01T10:00:00Z",
                    "objectIds": ["o1"],
                    "relationships": []
                }
            ],
            "objects": [
                {
                    "id": "o1",
                    "type": "X",
                    "attributes": {},
                    "changes": [],
                    "relationships": []
                }
            ],
            "objectRelations": []
        });

        let ocel: OCEL = serde_json::from_value(ocel_json).expect("Failed to parse OCEL JSON");
        assert_eq!(ocel.events.len(), 1);
        assert_eq!(ocel.objects.len(), 1);
        assert_eq!(ocel.events[0].event_type, "A");
        assert_eq!(ocel.objects[0].object_type, "X");
    }

    #[test]
    fn test_ocel_duplicate_event_types() {
        let ocel = create_test_ocel();

        // Check that event_types vector can contain duplicates if needed
        let event_types = &ocel.event_types;
        assert_eq!(event_types.len(), 2);
        assert!(event_types.contains(&"Order Created".to_string()));
    }

    #[test]
    fn test_ocel_empty_log() {
        let ocel = OCEL {
            event_types: vec![],
            object_types: vec![],
            events: vec![],
            objects: vec![],
            object_relations: vec![],
        };

        assert_eq!(ocel.events.len(), 0);
        assert_eq!(ocel.objects.len(), 0);
        assert!(ocel.event_types.is_empty());
        assert!(ocel.object_types.is_empty());
    }

    #[test]
    fn test_ocel_event_attributes() {
        let ocel = create_test_ocel();

        // Check event attributes
        let event = &ocel.events[0];
        assert_eq!(event.id, "e1");
        assert_eq!(event.event_type, "Order Created");
        assert_eq!(event.timestamp, "2024-01-01T10:00:00Z");

        // Check custom attribute
        if let Some(AttributeValue::Float(amount)) = event.attributes.get("amount") {
            assert_eq!(*amount, 100.0);
        } else {
            panic!("Expected Float attribute for 'amount'");
        }
    }

    #[test]
    fn test_ocel_object_attributes() {
        let ocel = create_test_ocel();

        // Check object attributes
        let obj = &ocel.objects[0];
        assert_eq!(obj.id, "order1");
        assert_eq!(obj.object_type, "Order");

        // Check custom attribute
        if let Some(AttributeValue::String(status)) = obj.attributes.get("status") {
            assert_eq!(status, "pending");
        } else {
            panic!("Expected String attribute for 'status'");
        }
    }
}
