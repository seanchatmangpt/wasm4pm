use wasm4pm_compat::ocel::{OCEL, OCELEvent};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq)]
pub enum GallVerdict {
    Fit { fitness: f64 },
    Deviation { fitness: f64, missing: Vec<String> },
    Blocked { reason: String },
    Inconclusive { reason: String },
}

#[derive(Debug, Clone, PartialEq)]
pub struct GallConformanceReceipt {
    pub verdict: GallVerdict,
    pub receipt_event: OCELEvent,
}

/// Authoritative wasm4pm replay for the Gall Checkpoint Doctrine.
/// 
/// Replays the given OCEL log against the required checkpoints and chain linkage,
/// emitting a formal conformance verdict.
pub fn check_gall_conformance(ocel: OCEL) -> GallVerdict {
    let required = ["GALL-CHECKPOINT-001", "GALL-CHECKPOINT-002", "GALL-CHECKPOINT-003", "GALL-CHECKPOINT-004"];
    let mut admitted = HashSet::new();
    let mut previous_receipt_id = None;
    let mut chain_broken = false;

    if ocel.events.is_empty() {
        return GallVerdict::Inconclusive { reason: "No events in OCEL log".to_string() };
    }

    for evt in &ocel.events {
        if evt.event_type == "checkpoint.admitted" {
            for rel in &evt.relationships {
                if rel.object_id.starts_with("GALL-CHECKPOINT-") {
                    admitted.insert(rel.object_id.clone());
                }
            }
        }

        // Equation Enforcement R_B (Receipt Chain)
        if let Some(pr_attr) = evt.attributes.iter().find(|a| a.name == "previous_receipt") {
            let pr = pr_attr.value.to_string();
            let pr_clean = pr.trim_matches('"');
            if !pr_clean.is_empty() && Some(pr_clean.to_string()) != previous_receipt_id {
                chain_broken = true;
            }
        }
        previous_receipt_id = Some(evt.id.clone());
    }

    if chain_broken {
        GallVerdict::Blocked { reason: "Chain Broken".to_string() }
    } else {
        let mut missing = Vec::new();
        for req in required {
            if !admitted.contains(req) {
                missing.push(req.to_string());
            }
        }
        let fitness = 1.0 - (missing.len() as f64 * 0.25);
        if missing.is_empty() {
            GallVerdict::Fit { fitness }
        } else {
            GallVerdict::Deviation { fitness, missing }
        }
    }
}
