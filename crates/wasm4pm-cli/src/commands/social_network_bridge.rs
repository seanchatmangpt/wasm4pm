//! Bridge that wires the real social-network-mining implementation
//! (`wasm4pm::network_metrics::SocialNetwork` centrality methods, as used by
//! `wasm4pm::social_network::compute_network_metrics`) into the CLI's
//! event-log type.
//!
//! `wasm4pm::social_network::compute_network_metrics` is `#[wasm_bindgen]`
//! and takes a `log_handle: &str` resolved against wasm-bindgen global state
//! (`get_or_init_state()`), so it cannot be called directly from the CLI
//! (there is no `_from_log` pure-Rust variant for it, unlike
//! `discover_handover_network_from_log`). This bridge instead builds the
//! same handover-of-work network construction that function uses internally
//! (see `wasm4pm/src/social_network.rs` lines 138-186) directly from a
//! `wasm4pm::models::EventLog`, then calls the real, public
//! `SocialNetwork::degree_centrality` / `betweenness_centrality` /
//! `closeness_centrality` methods on it — the same real methods
//! `compute_network_metrics` calls. No metric logic is reimplemented here;
//! only the handover-edge construction (which itself is a direct mirror of
//! the wasm-bindgen function's own inline construction) is duplicated
//! outside the wasm-bindgen boundary.
//!
//! Deliberately kept out of `mining.rs` (owned by a concurrent edit) so the
//! CLI can call this from `mining.rs` later with a single `mod` line and a
//! call to [`compute_social_network`]. Mirrors the pattern already
//! established by `heuristic_bridge.rs` in this same directory.

use std::collections::BTreeMap;
use wasm4pm::network_metrics::{NetworkEdge, NetworkNode, SocialNetwork};
use wasm4pm_compat::event_log::EventLog as CompatEventLog;

/// Real centrality metrics computed over a handover-of-work network, mirroring
/// the JSON shape returned by `wasm4pm::social_network::compute_network_metrics`
/// (`{"degree": ..., "betweenness": ..., "closeness": ...}`), each a map from
/// resource ID to a centrality score in `[0, 1]`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SocialNetworkMetrics {
    pub degree: BTreeMap<String, f64>,
    pub betweenness: BTreeMap<String, f64>,
    pub closeness: BTreeMap<String, f64>,
}

/// Build the handover-of-work `SocialNetwork` from a loaded
/// `wasm4pm_compat::event_log::EventLog` and compute its real centrality
/// metrics (`wasm4pm::network_metrics::SocialNetwork::degree_centrality`,
/// `betweenness_centrality`, `closeness_centrality`).
///
/// `wasm4pm::models::EventLog` has a `From<wasm4pm_compat::event_log::EventLog>`
/// impl already (see `wasm4pm/src/models.rs`), so the conversion here is a
/// real structural conversion (attributes + traces + events), not a stub.
///
/// `resource_key` is the event attribute holding the resource/originator
/// (typically `"org:resource"` in XES), analogous to `activity_key` for the
/// process-discovery bridges.
pub fn compute_social_network(
    log: &CompatEventLog,
    resource_key: &str,
) -> anyhow::Result<SocialNetworkMetrics> {
    let native_log: wasm4pm::models::EventLog = log.clone().into();

    // Mirror wasm4pm::social_network::compute_network_metrics's own inline
    // handover-network construction (see social_network.rs lines 138-186),
    // since that function's public entry point is a wasm-bindgen wrapper
    // over global JS-handle state, not a plain EventLog.
    let mut handovers: BTreeMap<(String, String), usize> = BTreeMap::new();
    let mut all_resources: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

    for trace in &native_log.traces {
        let resources: Vec<Option<String>> = trace
            .events
            .iter()
            .map(|e| {
                e.attributes
                    .get(resource_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for r in resources.iter().filter_map(|r| r.as_ref()) {
            all_resources.insert(r.clone());
        }

        for i in 0..resources.len().saturating_sub(1) {
            if let (Some(r1), Some(r2)) = (&resources[i], &resources[i + 1]) {
                if r1 != r2 {
                    *handovers.entry((r1.clone(), r2.clone())).or_default() += 1;
                }
            }
        }
    }

    let nodes: Vec<NetworkNode> = all_resources
        .iter()
        .map(|id| NetworkNode {
            id: id.clone(),
            label: Some(id.clone()),
            workload: None,
        })
        .collect();

    let edges: Vec<NetworkEdge> = handovers
        .iter()
        .map(|((from, to), weight)| NetworkEdge {
            from: from.clone(),
            to: to.clone(),
            weight: *weight,
        })
        .collect();

    let network = SocialNetwork { nodes, edges };

    Ok(SocialNetworkMetrics {
        degree: network.degree_centrality(),
        betweenness: network.betweenness_centrality(),
        closeness: network.closeness_centrality(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm4pm_compat::event_log::{
        Attribute, AttributeValue, Event, Trace, XESEditableAttribute,
    };

    /// `Event::with_activity` only sets `concept:name`; this helper also sets
    /// an `org:resource` attribute so the handover-network construction has
    /// a resource/originator to key on.
    fn event_with_activity_and_resource(activity: &str, resource: &str) -> Event {
        let mut event = Event::with_activity(activity);
        event.attributes.add_attribute(Attribute::new(
            "org:resource".to_string(),
            AttributeValue::String(resource.to_string()),
        ));
        event
    }

    fn build_small_log() -> CompatEventLog {
        // Two traces where resource "alice" hands work off to "bob"
        // (alice's activity is immediately followed, in the same trace, by
        // an activity performed by bob), plus a third resource "carol" who
        // only appears alone in a separate trace with no handover partner,
        // so the network has both a real handover edge and a resource with
        // no edges to make degree centrality meaningfully non-trivial.
        let trace1 = Trace::new(
            "case-1".to_string(),
            vec![
                event_with_activity_and_resource("register", "alice"),
                event_with_activity_and_resource("approve", "bob"),
            ],
        );
        let trace2 = Trace::new(
            "case-2".to_string(),
            vec![
                event_with_activity_and_resource("register", "alice"),
                event_with_activity_and_resource("approve", "bob"),
            ],
        );
        let trace3 = Trace::new(
            "case-3".to_string(),
            vec![event_with_activity_and_resource("audit", "carol")],
        );
        CompatEventLog {
            attributes: Vec::new(),
            traces: vec![trace1, trace2, trace3],
            extensions: None,
            classifiers: None,
            global_trace_attrs: None,
            global_event_attrs: None,
        }
    }

    #[test]
    fn compute_social_network_finds_real_handover_edge_between_alice_and_bob() {
        let log = build_small_log();
        let metrics = compute_social_network(&log, "org:resource")
            .expect("social network computation should not fail on a small valid log");

        // alice -> bob handover happens twice (case-1, case-2), never
        // reversed, so both should show up with nonzero degree centrality
        // while carol (no handover partner) has none.
        assert!(
            metrics.degree.contains_key("alice") && metrics.degree.contains_key("bob"),
            "expected alice and bob in degree centrality map, got {:?}",
            metrics.degree
        );
        assert!(
            metrics.degree["alice"] > 0.0,
            "expected alice to have nonzero degree centrality from the alice->bob handover, got {:?}",
            metrics.degree
        );
        assert!(
            metrics.degree["bob"] > 0.0,
            "expected bob to have nonzero degree centrality from the alice->bob handover, got {:?}",
            metrics.degree
        );
        assert_eq!(
            metrics.degree.get("carol").copied().unwrap_or(0.0),
            0.0,
            "carol has no handover partner in any trace, expected zero degree centrality, got {:?}",
            metrics.degree
        );
    }
}
