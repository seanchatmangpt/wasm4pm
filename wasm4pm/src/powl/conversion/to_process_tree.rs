/// Convert a POWL model to a process tree.
use crate::powl_arena::{Operator, PowlArena, PowlNode};
use crate::powl_process_tree::{ProcessTree, PtOperator};
use wasm4pm_compat::powl::{ChoiceGraph, ChoiceGraphNode};

struct Dag {
    n: usize,
    adj: Vec<Vec<usize>>,
}

impl Dag {
    fn new(n: usize) -> Self {
        Dag {
            n,
            adj: vec![Vec::new(); n],
        }
    }

    fn add_edge(&mut self, from: usize, to: usize) {
        self.adj[from].push(to);
    }

    fn in_degrees(&self) -> Vec<usize> {
        let mut deg = vec![0usize; self.n];
        for i in 0..self.n {
            for &j in &self.adj[i] {
                deg[j] += 1;
            }
        }
        deg
    }

    fn assign_levels(&self) -> Result<Vec<usize>, String> {
        let mut in_deg = self.in_degrees();
        let mut levels = vec![usize::MAX; self.n];
        let mut queue = std::collections::VecDeque::new();
        for i in 0..self.n {
            if in_deg[i] == 0 {
                levels[i] = 0;
                queue.push_back(i);
            }
        }
        let mut count = 0;
        while let Some(cur) = queue.pop_front() {
            count += 1;
            let next_level = levels[cur] + 1;
            for &succ in &self.adj[cur] {
                in_deg[succ] -= 1;
                if in_deg[succ] == 0 {
                    levels[succ] = next_level;
                    queue.push_back(succ);
                }
            }
        }
        if count != self.n {
            return Err(
                "Cycle detected in DAG; process trees cannot represent unstructured cycles."
                    .to_string(),
            );
        }
        Ok(levels)
    }

    fn transitive_reduction(&self) -> Dag {
        let n = self.n;
        let reachable = {
            let mut reach = vec![vec![false; n]; n];
            for (start, adj_row) in self.adj.iter().enumerate() {
                let mut visited = vec![false; n];
                let mut queue = std::collections::VecDeque::new();
                for &v in adj_row {
                    visited[v] = true;
                    queue.push_back(v);
                }
                while let Some(u) = queue.pop_front() {
                    reach[start][u] = true;
                    for &v in &self.adj[u] {
                        if !visited[v] {
                            visited[v] = true;
                            queue.push_back(v);
                        }
                    }
                }
            }
            reach
        };
        let mut red = Dag::new(n);
        for i in 0..n {
            for &j in &self.adj[i] {
                let mut redundant = false;
                for k in 0..n {
                    if k != j && self.adj[i].contains(&k) && reachable[k][j] {
                        redundant = true;
                        break;
                    }
                }
                if !redundant {
                    red.add_edge(i, j);
                }
            }
        }
        red
    }

    fn undirected_components(&self) -> Vec<Vec<usize>> {
        let n = self.n;
        let mut adj = vec![Vec::new(); n];
        for i in 0..n {
            for &j in &self.adj[i] {
                adj[i].push(j);
                adj[j].push(i);
            }
        }
        let mut visited = vec![false; n];
        let mut comps = Vec::new();
        for i in 0..n {
            if !visited[i] {
                let mut comp = Vec::new();
                let mut queue = std::collections::VecDeque::new();
                visited[i] = true;
                queue.push_back(i);
                while let Some(u) = queue.pop_front() {
                    comp.push(u);
                    for &v in &adj[u] {
                        if !visited[v] {
                            visited[v] = true;
                            queue.push_back(v);
                        }
                    }
                }
                comps.push(comp);
            }
        }
        comps
    }
}

pub fn apply_recursive(arena: &PowlArena, node_idx: u32) -> Result<ProcessTree, String> {
    match arena.get(node_idx) {
        None => Ok(ProcessTree::leaf(None)),
        Some(PowlNode::Transition(t)) => Ok(ProcessTree::leaf(t.label.clone())),
        Some(PowlNode::FrequentTransition(t)) => Ok(ProcessTree::leaf(Some(t.label.clone()))),
        Some(PowlNode::OperatorPowl(op)) => {
            let pt_op = match op.operator {
                Operator::Xor => PtOperator::Xor,
                Operator::Loop => PtOperator::Loop,
                Operator::PartialOrder => PtOperator::Sequence,
            };
            let mut children: Vec<ProcessTree> = Vec::new();
            for &c in &op.children {
                children.push(apply_recursive(arena, c)?);
            }
            Ok(ProcessTree::internal(pt_op, children))
        }
        Some(PowlNode::StrictPartialOrder(spo)) => {
            let n = spo.children.len();
            if n == 0 {
                return Ok(ProcessTree::leaf(None));
            }
            if n == 1 {
                return apply_recursive(arena, spo.children[0]);
            }
            let mut dag = Dag::new(n);
            for i in 0..n {
                for j in 0..n {
                    if spo.order.is_edge(i, j) {
                        dag.add_edge(i, j);
                    }
                }
            }
            let dag = dag.transitive_reduction();
            let components = dag.undirected_components();
            let mut component_trees: Vec<ProcessTree> = Vec::new();
            for comp in &components {
                if comp.len() == 1 {
                    let child_idx = spo.children[comp[0]];
                    component_trees.push(apply_recursive(arena, child_idx)?);
                    continue;
                }
                let local_to_global: &[usize] = comp;
                let global_to_local: Vec<Option<usize>> = {
                    let mut g2l = vec![None; n];
                    for (li, &gi) in local_to_global.iter().enumerate() {
                        g2l[gi] = Some(li);
                    }
                    g2l
                };
                let m = comp.len();
                let mut sub_dag = Dag::new(m);
                for (li, &gi) in local_to_global.iter().enumerate() {
                    for &succ_gi in &dag.adj[gi] {
                        if let Some(succ_li) = global_to_local[succ_gi] {
                            sub_dag.add_edge(li, succ_li);
                        }
                    }
                }
                let levels_map = sub_dag.assign_levels()?;
                let max_level = *levels_map.iter().max().unwrap_or(&0);
                let mut level_groups: Vec<Vec<usize>> = vec![Vec::new(); max_level + 1];
                for (li, &lv) in levels_map.iter().enumerate() {
                    if lv != usize::MAX {
                        level_groups[lv].push(li);
                    }
                }
                let mut level_trees: Vec<ProcessTree> = Vec::new();
                for group in &level_groups {
                    if group.is_empty() {
                        continue;
                    }
                    let mut sub_trees: Vec<ProcessTree> = Vec::new();
                    for &li in group {
                        sub_trees.push(apply_recursive(arena, spo.children[local_to_global[li]])?);
                    }
                    if sub_trees.len() == 1 {
                        level_trees.push(sub_trees.into_iter().next().expect("invariant: non-empty when len==1"));
                    } else {
                        level_trees.push(ProcessTree::internal(PtOperator::Parallel, sub_trees));
                    }
                }
                let subtree = if level_trees.len() == 1 {
                    level_trees.into_iter().next().expect("invariant: single-component subtree")
                } else {
                    ProcessTree::internal(PtOperator::Sequence, level_trees)
                };
                component_trees.push(subtree);
            }
            if component_trees.len() == 1 {
                Ok(component_trees.into_iter().next().expect("invariant: single-component result"))
            } else {
                Ok(ProcessTree::internal(PtOperator::Parallel, component_trees))
            }
        }

        Some(PowlNode::DecisionGraph(dg)) => {
            let n = dg.children.len();
            if n == 0 {
                return Ok(ProcessTree::leaf(None));
            }
            if n == 1 {
                return apply_recursive(arena, dg.children[0]);
            }
            let mut dag = Dag::new(n);
            for i in 0..n {
                for j in 0..n {
                    if dg.order.is_edge(i, j) {
                        dag.add_edge(i, j);
                    }
                }
            }
            let dag = dag.transitive_reduction();
            let components = dag.undirected_components();
            let mut component_trees: Vec<ProcessTree> = Vec::new();
            for comp in &components {
                if comp.len() == 1 {
                    let child_idx = dg.children[comp[0]];
                    component_trees.push(apply_recursive(arena, child_idx)?);
                    continue;
                }
                let local_to_global: &[usize] = comp;
                let global_to_local: Vec<Option<usize>> = {
                    let mut g2l = vec![None; n];
                    for (li, &gi) in local_to_global.iter().enumerate() {
                        g2l[gi] = Some(li);
                    }
                    g2l
                };
                let m = comp.len();
                let mut sub_dag = Dag::new(m);
                for (li, &gi) in local_to_global.iter().enumerate() {
                    for &succ_gi in &dag.adj[gi] {
                        if let Some(succ_li) = global_to_local[succ_gi] {
                            sub_dag.add_edge(li, succ_li);
                        }
                    }
                }
                let levels_map = sub_dag.assign_levels()?;
                let max_level = *levels_map.iter().max().unwrap_or(&0);
                let mut level_groups: Vec<Vec<usize>> = vec![Vec::new(); max_level + 1];
                for (li, &lv) in levels_map.iter().enumerate() {
                    if lv != usize::MAX {
                        level_groups[lv].push(li);
                    }
                }
                let mut level_trees: Vec<ProcessTree> = Vec::new();
                for group in &level_groups {
                    if group.is_empty() {
                        continue;
                    }
                    let mut sub_trees: Vec<ProcessTree> = Vec::new();
                    for &li in group {
                        sub_trees.push(apply_recursive(arena, dg.children[local_to_global[li]])?);
                    }
                    if sub_trees.len() == 1 {
                        level_trees.push(sub_trees.into_iter().next().expect("invariant: non-empty when len==1"));
                    } else {
                        level_trees.push(ProcessTree::internal(PtOperator::Parallel, sub_trees));
                    }
                }
                let subtree = if level_trees.len() == 1 {
                    level_trees.into_iter().next().expect("invariant: single-component subtree")
                } else {
                    ProcessTree::internal(PtOperator::Sequence, level_trees)
                };
                component_trees.push(subtree);
            }
            if component_trees.len() == 1 {
                Ok(component_trees.into_iter().next().expect("invariant: single-component result"))
            } else {
                Ok(ProcessTree::internal(PtOperator::Parallel, component_trees))
            }
        }

        Some(PowlNode::ChoiceGraph(cg)) => {
            let mut sub_trees: Vec<ProcessTree> = Vec::new();
            for n in &cg.graph.nodes {
                if let ChoiceGraphNode::SubModel(idx) = n {
                    sub_trees.push(apply_recursive(arena, *idx)?);
                }
            }
            if sub_trees.is_empty() {
                Ok(ProcessTree::leaf(None))
            } else if sub_trees.len() == 1 {
                Ok(sub_trees.into_iter().next().expect("invariant: non-empty when len==1"))
            } else {
                Ok(ProcessTree::internal(PtOperator::Xor, sub_trees))
            }
        }
    }
}

pub fn apply(arena: &PowlArena, root: u32) -> Result<ProcessTree, String> {
    apply_recursive(arena, root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn build(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn test_process_tree_leaf() {
        // Happy path: single transition becomes leaf node
        let (arena, root) = build("A");
        let pt = apply(&arena, root).unwrap();
        assert_eq!(pt.label.as_deref(), Some("A"));
        assert!(pt.operator.is_none());
    }

    #[test]
    fn test_process_tree_operators() {
        // XOR becomes XOR operator
        let (arena, root) = build("X ( A, B )");
        let pt = apply(&arena, root).unwrap();
        assert_eq!(pt.operator, Some(PtOperator::Xor));
        assert_eq!(pt.children.len(), 2);

        // Loop becomes loop operator
        let (arena, root) = build("* ( A, B )");
        let pt = apply(&arena, root).unwrap();
        assert_eq!(pt.operator, Some(PtOperator::Loop));
    }

    #[test]
    fn test_process_tree_partial_orders() {
        // Sequential PO becomes sequence
        let (arena, root) = build("PO=(nodes={A, B}, order={A-->B})");
        let pt = apply(&arena, root).unwrap();
        let repr = pt.to_repr();
        assert!(repr.contains("A") && repr.contains("B"));

        // Concurrent PO becomes parallel
        let (arena, root) = build("PO=(nodes={A, B}, order={})");
        let pt = apply(&arena, root).unwrap();
        assert_eq!(pt.operator, Some(PtOperator::Parallel));
    }
}
