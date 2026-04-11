//! Structural and behavioral diff between two POWL models.

use crate::powl::footprints::{self};
use crate::powl_arena::{PowlArena, PowlNode};
use serde::{Deserialize, Serialize};

pub type Pair = (String, String);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum AlwaysChange {
    BecameMandatory(String),
    BecameOptional(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum OrderChange {
    SequenceAdded(Pair),
    SequenceRemoved(Pair),
    ParallelAdded(Pair),
    ParallelRemoved(Pair),
    StartAdded(String),
    StartRemoved(String),
    EndAdded(String),
    EndRemoved(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StructureChange {
    pub location: String,
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    None,
    Minor,
    Moderate,
    Breaking,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelDiff {
    pub added_activities: Vec<String>,
    pub removed_activities: Vec<String>,
    pub always_changes: Vec<AlwaysChange>,
    pub order_changes: Vec<OrderChange>,
    pub structure_changes: Vec<StructureChange>,
    pub min_trace_length_delta: i64,
    pub severity: Severity,
    pub behaviourally_equivalent: bool,
}

impl ModelDiff {
    pub fn is_empty(&self) -> bool {
        self.added_activities.is_empty()
            && self.removed_activities.is_empty()
            && self.always_changes.is_empty()
            && self.order_changes.is_empty()
            && self.structure_changes.is_empty()
            && self.min_trace_length_delta == 0
    }
}

fn node_type_str(arena: &PowlArena, idx: u32) -> String {
    match arena.get(idx) {
        Some(PowlNode::Transition(t)) => {
            if t.label.is_some() {
                "Transition".into()
            } else {
                "tau".into()
            }
        }
        Some(PowlNode::FrequentTransition(_)) => "FrequentTransition".into(),
        Some(PowlNode::StrictPartialOrder(_)) => "StrictPartialOrder".into(),
        Some(PowlNode::DecisionGraph(_)) => "DecisionGraph".into(),
        Some(PowlNode::OperatorPowl(op)) => op.operator.as_str().to_string(),
        None => "Invalid".into(),
    }
}

fn structural_diff(
    arena_a: &PowlArena,
    idx_a: u32,
    arena_b: &PowlArena,
    idx_b: u32,
    path: &str,
    changes: &mut Vec<StructureChange>,
) {
    let ta = node_type_str(arena_a, idx_a);
    let tb = node_type_str(arena_b, idx_b);

    if ta != tb {
        changes.push(StructureChange {
            location: path.to_string(),
            from: ta.clone(),
            to: tb.clone(),
        });
    }

    let children_a: Vec<u32> = match arena_a.get(idx_a) {
        Some(PowlNode::StrictPartialOrder(s)) => s.children.clone(),
        Some(PowlNode::DecisionGraph(d)) => d.children.clone(),
        Some(PowlNode::OperatorPowl(o)) => o.children.clone(),
        _ => vec![],
    };
    let children_b: Vec<u32> = match arena_b.get(idx_b) {
        Some(PowlNode::StrictPartialOrder(s)) => s.children.clone(),
        Some(PowlNode::DecisionGraph(d)) => d.children.clone(),
        Some(PowlNode::OperatorPowl(o)) => o.children.clone(),
        _ => vec![],
    };

    let min_len = children_a.len().min(children_b.len());
    for i in 0..min_len {
        structural_diff(
            arena_a,
            children_a[i],
            arena_b,
            children_b[i],
            &format!("{}.child[{}]", path, i),
            changes,
        );
    }
}

pub fn diff(arena_a: &PowlArena, root_a: u32, arena_b: &PowlArena, root_b: u32) -> ModelDiff {
    let fp_a = footprints::apply(arena_a, root_a);
    let fp_b = footprints::apply(arena_b, root_b);

    let added_activities: Vec<String> = fp_b
        .activities
        .difference(&fp_a.activities)
        .cloned()
        .collect();
    let removed_activities: Vec<String> = fp_a
        .activities
        .difference(&fp_b.activities)
        .cloned()
        .collect();

    let mut always_changes = Vec::new();
    for act in fp_b
        .activities_always_happening
        .difference(&fp_a.activities_always_happening)
    {
        always_changes.push(AlwaysChange::BecameMandatory(act.clone()));
    }
    for act in fp_a
        .activities_always_happening
        .difference(&fp_b.activities_always_happening)
    {
        always_changes.push(AlwaysChange::BecameOptional(act.clone()));
    }

    let seq_a: std::collections::HashSet<_> = fp_a.sequence.clone();
    let seq_b: std::collections::HashSet<_> = fp_b.sequence.clone();
    let par_a: std::collections::HashSet<_> = fp_a.parallel.clone();
    let par_b: std::collections::HashSet<_> = fp_b.parallel.clone();

    let mut order_changes = Vec::new();

    for p in seq_b.difference(&seq_a) {
        order_changes.push(OrderChange::SequenceAdded(p.clone()));
    }
    for p in seq_a.difference(&seq_b) {
        order_changes.push(OrderChange::SequenceRemoved(p.clone()));
    }
    for p in par_b.difference(&par_a) {
        order_changes.push(OrderChange::ParallelAdded(p.clone()));
    }
    for p in par_a.difference(&par_b) {
        order_changes.push(OrderChange::ParallelRemoved(p.clone()));
    }
    for a in fp_b.start_activities.difference(&fp_a.start_activities) {
        order_changes.push(OrderChange::StartAdded(a.clone()));
    }
    for a in fp_a.start_activities.difference(&fp_b.start_activities) {
        order_changes.push(OrderChange::StartRemoved(a.clone()));
    }
    for a in fp_b.end_activities.difference(&fp_a.end_activities) {
        order_changes.push(OrderChange::EndAdded(a.clone()));
    }
    for a in fp_a.end_activities.difference(&fp_b.end_activities) {
        order_changes.push(OrderChange::EndRemoved(a.clone()));
    }

    let mut structure_changes = Vec::new();
    structural_diff(
        arena_a,
        root_a,
        arena_b,
        root_b,
        "root",
        &mut structure_changes,
    );

    let min_trace_length_delta = fp_b.min_trace_length as i64 - fp_a.min_trace_length as i64;

    let severity = if !removed_activities.is_empty()
        || always_changes
            .iter()
            .any(|c| matches!(c, AlwaysChange::BecameOptional(_)))
        || structure_changes.iter().any(|c| c.location == "root")
    {
        Severity::Breaking
    } else if !added_activities.is_empty()
        || !order_changes.is_empty()
        || min_trace_length_delta != 0
    {
        Severity::Moderate
    } else if !always_changes.is_empty() || !structure_changes.is_empty() {
        Severity::Minor
    } else {
        Severity::None
    };

    let behaviourally_equivalent = added_activities.is_empty()
        && removed_activities.is_empty()
        && order_changes.is_empty()
        && always_changes.is_empty()
        && min_trace_length_delta == 0;

    ModelDiff {
        added_activities,
        removed_activities,
        always_changes,
        order_changes,
        structure_changes,
        min_trace_length_delta,
        severity,
        behaviourally_equivalent,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn parse(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn test_diff_identical_models() {
        // Happy path: identical models have no diff
        let (aa, ra) = parse("X ( A, B )");
        let (ab, rb) = parse("X ( A, B )");
        let d = diff(&aa, ra, &ab, rb);
        assert!(d.behaviourally_equivalent);
        assert!(d.is_empty());
        assert_eq!(d.severity, Severity::None);
    }

    #[test]
    fn test_diff_activity_changes() {
        // Added activity detected
        let (aa, ra) = parse("A");
        let (ab, rb) = parse("X ( A, B )");
        let d = diff(&aa, ra, &ab, rb);
        assert!(d.added_activities.contains(&"B".to_string()));
        assert!(d.severity >= Severity::Moderate);

        // Removed activity is breaking change
        let (aa, ra) = parse("X ( A, B )");
        let (ab, rb) = parse("A");
        let d = diff(&aa, ra, &ab, rb);
        assert!(d.removed_activities.contains(&"B".to_string()));
        assert_eq!(d.severity, Severity::Breaking);
    }

    #[test]
    fn test_diff_structure_changes() {
        // Structure change at root detected
        let (aa, ra) = parse("X ( A, B )");
        let (ab, rb) = parse("*(A, B)");
        let d = diff(&aa, ra, &ab, rb);
        assert!(d.structure_changes.iter().any(|c| c.location == "root"));
    }
}
