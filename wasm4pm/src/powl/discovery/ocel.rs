use crate::models::EventLog;
use crate::powl::discovery::DiscoveryConfig;
/**
 * OCEL POWL Discovery
 *
 * Object-Centric Event Log (OCEL) discovery with FLATTENING and OC_POWL variants.
 */
use crate::powl_arena::PowlArena;

/// OCEL POWL discovery variant
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OcelVariant {
    Flattening,
    OcPowl,
}

impl OcelVariant {
    pub fn as_str(&self) -> &'static str {
        match self {
            OcelVariant::Flattening => "flattening",
            OcelVariant::OcPowl => "oc_powl",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "flattening" => Some(OcelVariant::Flattening),
            "oc_powl" => Some(OcelVariant::OcPowl),
            _ => None,
        }
    }
}

/// Discover POWL model from OCEL event log
pub fn discover_ocel_powl(
    ocel_log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
    variant: OcelVariant,
) -> Result<u32, String> {
    match variant {
        OcelVariant::Flattening => discover_flattening(ocel_log, config, arena),
        OcelVariant::OcPowl => discover_oc_powl_impl(ocel_log, config, arena),
    }
}

/// Flattening variant: Convert OCEL to traditional event log
fn discover_flattening(
    ocel_log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    // For now, use the log as-is
    // Full flattening requires OCEL-specific event structure
    super::discover_from_traces(ocel_log, config, arena)
}

/// OC-POWL variant: Native object-centric POWL discovery
fn discover_oc_powl_impl(
    ocel_log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    // For now, fall back to flattening
    // Full OC-POWL requires OCEL-specific analysis
    discover_flattening(ocel_log, config, arena)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Event;

    #[test]
    fn test_ocel_variant_from_str() {
        assert_eq!(
            OcelVariant::from_str("flattening"),
            Some(OcelVariant::Flattening)
        );
        assert_eq!(OcelVariant::from_str("oc_powl"), Some(OcelVariant::OcPowl));
        assert_eq!(OcelVariant::from_str("invalid"), None);
    }

    #[test]
    fn test_ocel_discovery() {
        use crate::models::Attributes;

        let mut attr = Attributes::new();
        attr.insert(
            "concept:name".to_string(),
            crate::models::AttributeValue::String("A".to_string()),
        );

        let log = EventLog {
            attributes: Attributes::new(),
            traces: vec![crate::models::Trace {
                attributes: Attributes::new(),
                events: vec![Event {
                    attributes: attr.clone(),
                }],
            }],
        };

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let _root = discover_ocel_powl(&log, &config, &mut arena, OcelVariant::Flattening).unwrap();
        assert!(arena.len() > 0);
    }
}
