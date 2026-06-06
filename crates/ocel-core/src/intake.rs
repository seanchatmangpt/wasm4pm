use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::BufRead;

use crate::{OCELEvent, OCELObject};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum OCELRecord {
    Event(OCELEvent),
    Object(OCELObject),
}

#[derive(Debug, Clone, Default)]
pub struct ExtractionPlan {
    pub target_event_types: Option<HashSet<String>>,
    pub target_object_types: Option<HashSet<String>>,
    pub qualifier_filters: Option<HashSet<String>>,
}

impl ExtractionPlan {
    pub fn is_event_allowed(&self, event_type: &str) -> bool {
        self.target_event_types
            .as_ref()
            .is_none_or(|types| types.contains(event_type))
    }

    pub fn is_object_allowed(&self, object_type: &str) -> bool {
        self.target_object_types
            .as_ref()
            .is_none_or(|types| types.contains(object_type))
    }

    pub fn is_qualifier_allowed(&self, qualifier: &str) -> bool {
        self.qualifier_filters
            .as_ref()
            .is_none_or(|filters| filters.contains(qualifier))
    }
}

pub struct NDJsonStream<R> {
    reader: R,
    plan: ExtractionPlan,
    allowed_objects: HashSet<String>,
}

impl<R: BufRead> NDJsonStream<R> {
    pub fn new(reader: R, plan: ExtractionPlan) -> Self {
        Self {
            reader,
            plan,
            allowed_objects: HashSet::new(),
        }
    }
}

impl<R: BufRead> Iterator for NDJsonStream<R> {
    type Item = Result<OCELRecord, String>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut line = String::new();
        loop {
            line.clear();
            match self.reader.read_line(&mut line) {
                Ok(0) => return None, // EOF
                Ok(_) => {
                    let line_trim = line.trim();
                    if line_trim.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<OCELRecord>(line_trim) {
                        Ok(OCELRecord::Object(obj)) => {
                            if self.plan.is_object_allowed(&obj.object_type) {
                                self.allowed_objects.insert(obj.id.clone());
                                return Some(Ok(OCELRecord::Object(obj)));
                            } else {
                                continue;
                            }
                        }
                        Ok(OCELRecord::Event(mut evt)) => {
                            if !self.plan.is_event_allowed(&evt.event_type) {
                                continue;
                            }

                            // Enforce referential integrity and qualifier filters
                            evt.relationships.retain(|rel| {
                                let qual_allowed = self.plan.is_qualifier_allowed(&rel.qualifier);
                                let obj_allowed = if self.plan.target_object_types.is_some() {
                                    self.allowed_objects.contains(&rel.object_id)
                                } else {
                                    true
                                };
                                qual_allowed && obj_allowed
                            });

                            return Some(Ok(OCELRecord::Event(evt)));
                        }
                        Err(e) => {
                            return Some(Err(format!(
                                "Failed to parse line: {} - {}",
                                e, line_trim
                            )));
                        }
                    }
                }
                Err(e) => return Some(Err(e.to_string())),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extraction_plan_filters() {
        let mut target_events = HashSet::new();
        target_events.insert("order_placed".to_string());

        let mut target_objects = HashSet::new();
        target_objects.insert("order".to_string());

        let plan = ExtractionPlan {
            target_event_types: Some(target_events),
            target_object_types: Some(target_objects),
            qualifier_filters: None,
        };

        assert!(plan.is_event_allowed("order_placed"));
        assert!(!plan.is_event_allowed("item_shipped"));

        assert!(plan.is_object_allowed("order"));
        assert!(!plan.is_object_allowed("item"));
    }

    #[test]
    fn test_ndjson_stream_parsing_and_integrity() {
        let ndjson = r#"{"id": "o1", "type": "order", "attributes": [], "relationships": []}
{"id": "o2", "type": "item", "attributes": [], "relationships": []}
{"id": "e1", "type": "order_placed", "time": "2023-01-01T12:00:00Z", "attributes": [], "relationships": [{"objectId": "o1", "qualifier": "creates"}, {"objectId": "o2", "qualifier": "includes"}]}
{"id": "e2", "type": "item_shipped", "time": "2023-01-02T12:00:00Z", "attributes": [], "relationships": [{"objectId": "o2", "qualifier": "ships"}]}"#;

        let mut target_events = HashSet::new();
        target_events.insert("order_placed".to_string());

        let mut target_objects = HashSet::new();
        target_objects.insert("order".to_string());

        let plan = ExtractionPlan {
            target_event_types: Some(target_events),
            target_object_types: Some(target_objects),
            qualifier_filters: None,
        };

        let stream = NDJsonStream::new(ndjson.as_bytes(), plan);
        let results: Vec<Result<OCELRecord, String>> = stream.collect();

        // We expect:
        // 1. o1 object (allowed)
        // 2. o2 object (ignored, type "item" not allowed)
        // 3. e1 event (allowed, but relationship to o2 is dropped)
        // 4. e2 event (ignored, type "item_shipped" not allowed)

        assert_eq!(results.len(), 2);

        match &results[0] {
            Ok(OCELRecord::Object(obj)) => {
                assert_eq!(obj.id, "o1");
                assert_eq!(obj.object_type, "order");
            }
            _ => unreachable!("Expected object"),
        }

        match &results[1] {
            Ok(OCELRecord::Event(evt)) => {
                assert_eq!(evt.id, "e1");
                assert_eq!(evt.relationships.len(), 1); // o1 kept, o2 dropped
                assert_eq!(evt.relationships[0].object_id, "o1");
            }
            _ => unreachable!("Expected event"),
        }
    }
}
