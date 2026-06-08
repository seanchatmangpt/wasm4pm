//! AutoInstinct: The 1977 Old-AI Substrate
//!
//! Based on Margaret A. Boden's "Artificial Intelligence and Natural Man" (1977)
//!
//! This module maps the historical "old AI organ catalog" into verifiable,
//! nanosecond-scale WebAssembly components for MCP+ without LLMs.
//!
//! ## Sub-systems
//! - `neurosis`: Belief systems, personality simulation (Colby/Abelson lineage)
//! - `semantics`: Natural language understanding (ELIZA/SHRDLU/Schank)
//! - `vision`: Symbolic visual world processing (Line-drawing/Polyhedra)
//! - `learning`: Old-AI learning & problem solving (Winston/HACKER)

pub mod learning;
pub mod neurosis;
pub mod semantics;
pub mod vision;
