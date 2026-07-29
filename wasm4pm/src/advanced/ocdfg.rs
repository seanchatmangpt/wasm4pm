use crate::discovery::discover_ocel_dfg_per_type_pure;
use crate::models::{DFG, OCEL};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Object-Centric Directly Follows Graph (OC-DFG)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCDFG {
    /// Mapping from object type to its specific Directly-Follows Graph
    pub dfgs: BTreeMap<String, DFG>,
}

impl OCDFG {
    /// Discover an OC-DFG from an OCEL log.
    ///
    /// Thin wrapper: delegates to [`discover_ocel_dfg_per_type_pure`]
    /// (`discovery.rs`), the canonical per-object-type OC-DFG computation.
    /// Previously this type carried its own independent, `HashMap`-ordered
    /// (non-deterministic node/edge ordering) reimplementation of the same
    /// algorithm — the two implementations were unreconciled and untested
    /// for agreement (see `wasm4pm/correspondence/maps/ocel-semantics.json`,
    /// `flagged_defects_out_of_scope`). Consolidating onto one computation
    /// removes that divergence risk without changing this struct's public
    /// shape or `discover`'s signature, so the CLI bridge
    /// (`crates/wasm4pm-cli/src/commands/ocdfg_bridge.rs`) is unaffected.
    pub fn discover(ocel: &OCEL) -> Self {
        Self {
            dfgs: discover_ocel_dfg_per_type_pure(ocel),
        }
    }
}
