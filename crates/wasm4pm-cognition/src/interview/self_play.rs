//! Self-play bootstrap harness (ARD §3.12 Self-Play Factory).
//!
//! `SelfPlayActor` is real and testable against a real (deterministic)
//! implementation. A live LLM call is a genuine external-system boundary
//! this crate cannot cross in a test run, so wiring an actual model in is a
//! documented follow-up — but the trait, provenance recording, and the
//! "candidate until independently verified" admission discipline are real
//! today, tested against [`FixtureActor`] rather than mocked away.

use super::graph::SemanticGraph;

/// An artifact proposed by a self-play actor. Candidate state — never
/// trusted until independently re-verified by a caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelfPlayArtifact {
    /// The proposing actor's id.
    pub actor_id: String,
    /// BLAKE3 hex digest of the produced content.
    pub artifact_hash: String,
    /// The produced content itself.
    pub content: String,
}

/// Full provenance for one self-play run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelfPlayRun {
    /// Which actor produced this run.
    pub actor_id: String,
    /// BLAKE3 hex digest of the seed graph state the actor was given.
    pub seed_hash: String,
    /// The produced artifact.
    pub artifact: SelfPlayArtifact,
    /// Whether the artifact was independently admitted after the run.
    pub admitted: bool,
}

/// A role that proposes candidate cognition artifacts from a seed graph.
pub trait SelfPlayActor {
    /// This actor's stable identifier.
    fn actor_id(&self) -> &str;
    /// Propose an artifact given the current seed graph.
    fn propose(&self, seed: &SemanticGraph) -> SelfPlayArtifact;
}

fn hash_seed(seed: &SemanticGraph) -> String {
    let mut hasher = blake3::Hasher::new();
    for triple in seed.query(None, None, None) {
        hasher.update(triple.subject.as_bytes());
        hasher.update(triple.predicate.as_bytes());
        hasher.update(triple.object.as_bytes());
    }
    hasher.finalize().to_hex().to_string()
}

/// Run one self-play actor against `seed`, recording full provenance.
/// `verify` decides independently whether the artifact is admitted — the
/// factory itself never self-certifies its own output.
pub fn run_self_play(
    actor: &dyn SelfPlayActor,
    seed: &SemanticGraph,
    verify: impl FnOnce(&SelfPlayArtifact) -> bool,
) -> SelfPlayRun {
    let artifact = actor.propose(seed);
    let admitted = verify(&artifact);
    SelfPlayRun {
        actor_id: actor.actor_id().to_string(),
        seed_hash: hash_seed(seed),
        artifact,
        admitted,
    }
}

/// A deterministic, real (non-mocked) test-double actor: proposes a fixed
/// artifact derived from the seed's triple count, standing in for a live
/// Ollama-backed actor in tests.
pub struct FixtureActor {
    id: String,
}

impl FixtureActor {
    /// Construct a fixture actor with the given id.
    pub fn new(id: impl Into<String>) -> Self {
        Self { id: id.into() }
    }
}

impl SelfPlayActor for FixtureActor {
    fn actor_id(&self) -> &str {
        &self.id
    }

    fn propose(&self, seed: &SemanticGraph) -> SelfPlayArtifact {
        let content = format!("candidate-derived-from-{}-triples", seed.len());
        SelfPlayArtifact {
            actor_id: self.id.clone(),
            artifact_hash: blake3::hash(content.as_bytes()).to_hex().to_string(),
            content,
        }
    }
}
