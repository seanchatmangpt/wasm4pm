//! AutoSystems manufacturing layer: cost laws, Pareto dominance, receipt chains,
//! adversarial gates, and the cognition contract framework.

pub mod adversarial;
pub mod candidates;
pub mod contract;
pub mod cost_law;
pub mod dominance;
pub mod findings;
pub mod receipt;

pub use candidates::{all_candidates, Candidate};
pub use contract::{run_contract, CognitionContract, ContractResult};
pub use cost_law::{CostLaw, ReplacementCostLaw, TraditionalCostLaw};
pub use dominance::{reject_dominated, DomainProfile};
pub use findings::{Detector, DetectorInput, Finding, FindingRegistry, Severity};
pub use receipt::ReceiptChain;
