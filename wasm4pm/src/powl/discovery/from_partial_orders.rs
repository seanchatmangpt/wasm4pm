use crate::models::EventLog;
use crate::powl::discovery::DiscoveryConfig;
/**
 * Partial Order Discovery from lifecycle logs
 *
 * Reveals inherent concurrency from start/complete lifecycle events.
 */
use crate::powl_arena::PowlArena;

/// Discover POWL model from partially ordered event log
pub fn discover_from_partial_orders(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    if log.traces.is_empty() {
        return Ok(arena.add_silent_transition());
    }

    // For now, fall back to standard discovery
    // Full lifecycle analysis requires more complex event structure
    super::discover_from_traces(log, config, arena)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_partial_order_fallback() {
        use crate::models::{Attributes, Event};

        let mut attr_a = Attributes::new();
        attr_a.insert(
            "concept:name".to_string(),
            crate::models::AttributeValue::String("A".to_string()),
        );

        let mut attr_b = Attributes::new();
        attr_b.insert(
            "concept:name".to_string(),
            crate::models::AttributeValue::String("B".to_string()),
        );

        let log = EventLog {
            attributes: Attributes::new(),
            traces: vec![crate::models::Trace {
                attributes: Attributes::new(),
                events: vec![
                    Event {
                        attributes: attr_a.clone(),
                    },
                    Event {
                        attributes: attr_b.clone(),
                    },
                ],
            }],
        };

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let _root = discover_from_partial_orders(&log, &config, &mut arena).unwrap();
        assert!(arena.len() > 0);
    }
}
