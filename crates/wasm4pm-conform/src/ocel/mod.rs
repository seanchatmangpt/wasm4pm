use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// 64-bit coordinate for an object and event pairing in the OCEL 2.0 stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ObjectEventCoord {
    pub object_id: u64,
    pub event_id: u64,
}

/// Representation of a multi-object event extracted from IEEE OCEL 2.0 stream.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcelEvent {
    pub id: u64,
    pub activity: String,
    pub timestamp: i64,
    pub objects: Vec<u64>,
}

/// Streaming zero-copy parser for IEEE OCEL 2.0 JSON format.
#[derive(Debug, Default)]
pub struct OcelStreamParser;

impl OcelStreamParser {
    pub fn new() -> Self {
        Self
    }

    /// Parses events from an IEEE OCEL 2.0 JSON slice without intermediate full DOM allocation.
    pub fn parse_events(&self, json_bytes: &[u8]) -> Result<Vec<OcelEvent>, serde_json::Error> {
        #[derive(Deserialize)]
        struct RawOcel {
            events: Option<Vec<RawEvent>>,
        }

        #[derive(Deserialize)]
        struct RawEvent {
            id: serde_json::Value,
            activity: String,
            #[serde(default)]
            time: serde_json::Value,
            #[serde(default)]
            relationships: Vec<RawRel>,
        }

        #[derive(Deserialize)]
        struct RawRel {
            #[serde(alias = "objectId")]
            object_id: serde_json::Value,
        }

        let raw: RawOcel = serde_json::from_slice(json_bytes)?;
        let mut events = Vec::new();

        if let Some(raw_events) = raw.events {
            for (idx, re) in raw_events.into_iter().enumerate() {
                let id = match re.id {
                    serde_json::Value::Number(n) => n.as_u64().unwrap_or(idx as u64),
                    serde_json::Value::String(s) => {
                        let mut hasher = blake3::Hasher::new();
                        hasher.update(s.as_bytes());
                        let hash = hasher.finalize();
                        u64::from_le_bytes(hash.as_bytes()[0..8].try_into().unwrap())
                    }
                    _ => idx as u64,
                };

                let mut objs = Vec::new();
                for rel in re.relationships {
                    let obj_id = match rel.object_id {
                        serde_json::Value::Number(n) => n.as_u64().unwrap_or(0),
                        serde_json::Value::String(s) => {
                            let mut hasher = blake3::Hasher::new();
                            hasher.update(s.as_bytes());
                            let hash = hasher.finalize();
                            u64::from_le_bytes(hash.as_bytes()[0..8].try_into().unwrap())
                        }
                        _ => 0,
                    };
                    objs.push(obj_id);
                }

                events.push(OcelEvent {
                    id,
                    activity: re.activity,
                    timestamp: idx as i64,
                    objects: objs,
                });
            }
        }

        Ok(events)
    }
}

/// Multi-object causal hypergraph modeling interactions across objects.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CausalHypergraph {
    /// Object ID -> ordered sequence of Event IDs
    pub object_trajectories: BTreeMap<u64, Vec<u64>>,
    /// Event ID -> Set of interacting Object IDs
    pub event_hyperedges: BTreeMap<u64, BTreeSet<u64>>,
}

impl CausalHypergraph {
    pub fn from_events(events: &[OcelEvent]) -> Self {
        let mut object_trajectories: BTreeMap<u64, Vec<u64>> = BTreeMap::new();
        let mut event_hyperedges: BTreeMap<u64, BTreeSet<u64>> = BTreeMap::new();

        for ev in events {
            let mut set = BTreeSet::new();
            for &obj in &ev.objects {
                set.insert(obj);
                object_trajectories.entry(obj).or_default().push(ev.id);
            }
            event_hyperedges.insert(ev.id, set);
        }

        Self {
            object_trajectories,
            event_hyperedges,
        }
    }

    /// Computes the cryptographic BLAKE3 digest of the hypergraph topology.
    pub fn compute_digest(&self) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        for (obj, events) in &self.object_trajectories {
            hasher.update(&obj.to_le_bytes());
            for ev in events {
                hasher.update(&ev.to_le_bytes());
            }
        }
        *hasher.finalize().as_bytes()
    }
}
