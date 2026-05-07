//! Architecture candidates: 9 families with baseline scores.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Runtime boundary where work executes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RuntimeBoundary {
    /// Client WASM execution
    ClientWasm,
    /// Customer's own infrastructure
    CustomerNode,
    /// Peer node
    Peer,
    /// Atomvm coordinator
    AtomvmCoord,
    /// Cloud residual services
    CloudResidual,
    /// Forbidden centralized work
    ForbiddenCentralWork,
}

/// Architecture family.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ArchitectureFamily {
    /// Centralized cloud service
    CentralizedCloud,
    /// Local-first CRDT
    LocalFirstCrdt,
    /// WASM-local compute
    WasmLocal,
    /// P2P gossip protocol
    P2pGossip,
    /// Edge compute
    EdgeCompute,
    /// Hybrid fog
    HybridFog,
    /// Mesh network
    MeshNetwork,
    /// Broadcast server
    BroadcastServer,
    /// Event sourcing
    EventSourcing,
}

/// A candidate architecture with scored dimensions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    /// Unique candidate ID
    pub id: String,
    /// Architecture family
    pub family: ArchitectureFamily,
    /// Where work runs
    pub runtime_boundaries: Vec<RuntimeBoundary>,
    /// Dimension scores: cost, latency, throughput, availability, scalability, compliance
    pub scores: BTreeMap<String, f64>,
}

/// Return all 9 authoritative candidates with baseline scores.
pub fn all_candidates() -> Vec<Candidate> {
    let mut candidates = vec![];

    candidates.push(Candidate {
        id: "centralized-cloud".to_string(),
        family: ArchitectureFamily::CentralizedCloud,
        runtime_boundaries: vec![RuntimeBoundary::ForbiddenCentralWork],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.90);
            m.insert("latency".to_string(), 0.30);
            m.insert("throughput".to_string(), 0.95);
            m.insert("availability".to_string(), 0.99);
            m.insert("scalability".to_string(), 0.85);
            m.insert("compliance".to_string(), 0.20);
            m
        },
    });

    candidates.push(Candidate {
        id: "local-first-crdt".to_string(),
        family: ArchitectureFamily::LocalFirstCrdt,
        runtime_boundaries: vec![RuntimeBoundary::ClientWasm, RuntimeBoundary::Peer],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.18);
            m.insert("latency".to_string(), 0.92);
            m.insert("throughput".to_string(), 0.70);
            m.insert("availability".to_string(), 0.88);
            m.insert("scalability".to_string(), 0.72);
            m.insert("compliance".to_string(), 0.95);
            m
        },
    });

    candidates.push(Candidate {
        id: "wasm-local".to_string(),
        family: ArchitectureFamily::WasmLocal,
        runtime_boundaries: vec![RuntimeBoundary::ClientWasm],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.15);
            m.insert("latency".to_string(), 0.98);
            m.insert("throughput".to_string(), 0.60);
            m.insert("availability".to_string(), 0.75);
            m.insert("scalability".to_string(), 0.50);
            m.insert("compliance".to_string(), 0.98);
            m
        },
    });

    candidates.push(Candidate {
        id: "p2p-gossip".to_string(),
        family: ArchitectureFamily::P2pGossip,
        runtime_boundaries: vec![RuntimeBoundary::Peer],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.25);
            m.insert("latency".to_string(), 0.65);
            m.insert("throughput".to_string(), 0.75);
            m.insert("availability".to_string(), 0.80);
            m.insert("scalability".to_string(), 0.88);
            m.insert("compliance".to_string(), 0.90);
            m
        },
    });

    candidates.push(Candidate {
        id: "edge-compute".to_string(),
        family: ArchitectureFamily::EdgeCompute,
        runtime_boundaries: vec![RuntimeBoundary::CloudResidual],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.55);
            m.insert("latency".to_string(), 0.50);
            m.insert("throughput".to_string(), 0.80);
            m.insert("availability".to_string(), 0.90);
            m.insert("scalability".to_string(), 0.80);
            m.insert("compliance".to_string(), 0.70);
            m
        },
    });

    candidates.push(Candidate {
        id: "hybrid-fog".to_string(),
        family: ArchitectureFamily::HybridFog,
        runtime_boundaries: vec![
            RuntimeBoundary::ClientWasm,
            RuntimeBoundary::CloudResidual,
        ],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.48);
            m.insert("latency".to_string(), 0.70);
            m.insert("throughput".to_string(), 0.82);
            m.insert("availability".to_string(), 0.92);
            m.insert("scalability".to_string(), 0.78);
            m.insert("compliance".to_string(), 0.78);
            m
        },
    });

    candidates.push(Candidate {
        id: "mesh-network".to_string(),
        family: ArchitectureFamily::MeshNetwork,
        runtime_boundaries: vec![RuntimeBoundary::Peer, RuntimeBoundary::AtomvmCoord],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.35);
            m.insert("latency".to_string(), 0.72);
            m.insert("throughput".to_string(), 0.68);
            m.insert("availability".to_string(), 0.85);
            m.insert("scalability".to_string(), 0.85);
            m.insert("compliance".to_string(), 0.92);
            m
        },
    });

    candidates.push(Candidate {
        id: "broadcast-server".to_string(),
        family: ArchitectureFamily::BroadcastServer,
        runtime_boundaries: vec![RuntimeBoundary::CloudResidual],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.70);
            m.insert("latency".to_string(), 0.42);
            m.insert("throughput".to_string(), 0.92);
            m.insert("availability".to_string(), 0.95);
            m.insert("scalability".to_string(), 0.82);
            m.insert("compliance".to_string(), 0.50);
            m
        },
    });

    candidates.push(Candidate {
        id: "event-sourcing".to_string(),
        family: ArchitectureFamily::EventSourcing,
        runtime_boundaries: vec![RuntimeBoundary::CloudResidual, RuntimeBoundary::Peer],
        scores: {
            let mut m = BTreeMap::new();
            m.insert("cost".to_string(), 0.45);
            m.insert("latency".to_string(), 0.55);
            m.insert("throughput".to_string(), 0.78);
            m.insert("availability".to_string(), 0.88);
            m.insert("scalability".to_string(), 0.82);
            m.insert("compliance".to_string(), 0.85);
            m
        },
    });

    candidates
}
