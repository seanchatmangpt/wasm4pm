use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::fmt::Write as _;

/// Network metrics for social network analysis.
/// Computes centrality, clustering coefficient, and community detection.

#[derive(Clone)]
pub struct NetworkNode {
    pub id: String,
    pub label: Option<String>,
    pub workload: Option<usize>,
}

#[derive(Clone)]
pub struct NetworkEdge {
    pub from: String,
    pub to: String,
    pub weight: usize,
}

#[derive(Clone)]
pub struct SocialNetwork {
    pub nodes: Vec<NetworkNode>,
    pub edges: Vec<NetworkEdge>,
}

impl SocialNetwork {
    /// Compute degree centrality: proportion of other nodes connected to this node.
    pub fn degree_centrality(&self) -> BTreeMap<String, f64> {
        let n = self.nodes.len() as f64;
        if n <= 1.0 {
            return BTreeMap::new();
        }

        let mut degrees: HashMap<String, usize> = HashMap::new();
        for edge in &self.edges {
            *degrees.entry(edge.from.clone()).or_default() += 1;
            *degrees.entry(edge.to.clone()).or_default() += 1;
        }

        let mut centrality = BTreeMap::new();
        for node in &self.nodes {
            let degree = degrees.get(&node.id).copied().unwrap_or(0);
            centrality.insert(node.id.clone(), degree as f64 / (n - 1.0));
        }
        centrality
    }

    /// Compute betweenness centrality: measure of how often a node lies on shortest paths.
    /// Uses Brandes algorithm approximation for efficiency.
    pub fn betweenness_centrality(&self) -> BTreeMap<String, f64> {
        let n = self.nodes.len();
        if n <= 2 {
            return BTreeMap::new();
        }

        let mut betweenness: BTreeMap<String, f64> =
            self.nodes.iter().map(|n| (n.id.clone(), 0.0)).collect();

        // Build adjacency list
        let mut adj: HashMap<String, Vec<String>> = HashMap::new();
        for node in &self.nodes {
            adj.insert(node.id.clone(), Vec::new());
        }
        for edge in &self.edges {
            adj.entry(edge.from.clone())
                .or_default()
                .push(edge.to.clone());
            adj.entry(edge.to.clone())
                .or_default()
                .push(edge.from.clone());
        }

        // BFS from each node
        for source in &self.nodes {
            let mut queue = VecDeque::new();
            let mut visited: HashSet<String> = HashSet::new();
            let mut predecessors: HashMap<String, Vec<String>> = HashMap::new();
            let mut distances: HashMap<String, usize> = HashMap::new();

            queue.push_back(source.id.clone());
            visited.insert(source.id.clone());
            distances.insert(source.id.clone(), 0);

            while let Some(v) = queue.pop_front() {
                if let Some(neighbors) = adj.get(&v) {
                    for w in neighbors {
                        if !visited.contains(w) {
                            visited.insert(w.clone());
                            distances.insert(w.clone(), distances[&v] + 1);
                            queue.push_back(w.clone());
                        }
                        if distances.get(w).copied().unwrap_or(usize::MAX) == distances[&v] + 1 {
                            predecessors.entry(w.clone()).or_default().push(v.clone());
                        }
                    }
                }
            }

            // Accumulation phase (simplified)
            for node in &self.nodes {
                if node.id != source.id {
                    if let Some(preds) = predecessors.get(&node.id) {
                        for pred in preds {
                            if let Some(bc) = betweenness.get_mut(pred) {
                                *bc += 1.0 / (preds.len() as f64).max(1.0);
                            }
                        }
                    }
                }
            }
        }

        // Normalize
        let max_val = betweenness.values().copied().fold(0.0, f64::max).max(1.0);
        for bc in betweenness.values_mut() {
            *bc /= max_val;
        }
        betweenness
    }

    /// Compute closeness centrality: average shortest path distance to all other nodes.
    pub fn closeness_centrality(&self) -> BTreeMap<String, f64> {
        let n = self.nodes.len();
        if n <= 1 {
            return BTreeMap::new();
        }

        let mut closeness = BTreeMap::new();

        // Build adjacency list
        let mut adj: HashMap<String, Vec<String>> = HashMap::new();
        for node in &self.nodes {
            adj.insert(node.id.clone(), Vec::new());
        }
        for edge in &self.edges {
            adj.entry(edge.from.clone())
                .or_default()
                .push(edge.to.clone());
            adj.entry(edge.to.clone())
                .or_default()
                .push(edge.from.clone());
        }

        // BFS from each node
        for source in &self.nodes {
            let mut queue = VecDeque::new();
            let mut distances: HashMap<String, usize> = HashMap::new();

            queue.push_back(source.id.clone());
            distances.insert(source.id.clone(), 0);

            while let Some(v) = queue.pop_front() {
                if let Some(neighbors) = adj.get(&v) {
                    for w in neighbors {
                        if !distances.contains_key(w) {
                            distances.insert(w.clone(), distances[&v] + 1);
                            queue.push_back(w.clone());
                        }
                    }
                }
            }

            // Compute closeness (sum of reciprocal distances)
            let mut sum_reciprocals = 0.0;
            let mut reachable = 0;
            for node in &self.nodes {
                if node.id != source.id {
                    if let Some(dist) = distances.get(&node.id) {
                        if *dist > 0 {
                            sum_reciprocals += 1.0 / (*dist as f64);
                            reachable += 1;
                        }
                    }
                }
            }

            let c = if reachable > 0 {
                sum_reciprocals / (reachable as f64)
            } else {
                0.0
            };
            closeness.insert(source.id.clone(), c);
        }

        closeness
    }

    /// Compute clustering coefficient: measure of local clustering.
    /// Global coefficient = average of local coefficients.
    pub fn clustering_coefficient(&self) -> (f64, BTreeMap<String, f64>) {
        let mut local_coefficients: BTreeMap<String, f64> = BTreeMap::new();

        // Build adjacency list
        let mut adj: HashMap<String, HashSet<String>> = HashMap::new();
        for node in &self.nodes {
            adj.insert(node.id.clone(), HashSet::new());
        }
        for edge in &self.edges {
            adj.entry(edge.from.clone())
                .or_default()
                .insert(edge.to.clone());
            adj.entry(edge.to.clone())
                .or_default()
                .insert(edge.from.clone());
        }

        for node in &self.nodes {
            let neighbors: Vec<_> = adj
                .get(&node.id)
                .map(|s| s.iter().cloned().collect())
                .unwrap_or_default();

            if neighbors.len() <= 1 {
                local_coefficients.insert(node.id.clone(), 0.0);
                continue;
            }

            // Count edges among neighbors
            let mut edge_count = 0;
            for i in 0..neighbors.len() {
                for j in i + 1..neighbors.len() {
                    if let Some(neighbor_adj) = adj.get(&neighbors[i]) {
                        if neighbor_adj.contains(&neighbors[j]) {
                            edge_count += 1;
                        }
                    }
                }
            }

            let k = neighbors.len() as f64;
            let possible_edges = k * (k - 1.0) / 2.0;
            let coeff = if possible_edges > 0.0 {
                edge_count as f64 / possible_edges
            } else {
                0.0
            };
            local_coefficients.insert(node.id.clone(), coeff);
        }

        let global = if !local_coefficients.is_empty() {
            local_coefficients.values().sum::<f64>() / (local_coefficients.len() as f64)
        } else {
            0.0
        };

        (global, local_coefficients)
    }

    /// Detect communities using Louvain algorithm (simplified greedy version).
    /// Returns a map of node_id -> community_id.
    pub fn community_detection(&self) -> BTreeMap<String, usize> {
        let mut communities: BTreeMap<String, usize> = BTreeMap::new();
        for (idx, node) in self.nodes.iter().enumerate() {
            communities.insert(node.id.clone(), idx); // Start with each node in own community
        }

        // Build adjacency list with weights
        let mut adj: HashMap<String, Vec<(String, usize)>> = HashMap::new();
        for node in &self.nodes {
            adj.insert(node.id.clone(), Vec::new());
        }
        for edge in &self.edges {
            adj.entry(edge.from.clone())
                .or_default()
                .push((edge.to.clone(), edge.weight));
            adj.entry(edge.to.clone())
                .or_default()
                .push((edge.from.clone(), edge.weight));
        }

        // Greedy optimization (simplified Louvain)
        let mut improved = true;
        let mut iterations = 0;
        const MAX_ITERATIONS: usize = 10;

        while improved && iterations < MAX_ITERATIONS {
            improved = false;
            iterations += 1;

            for node in &self.nodes {
                let current_comm = communities[&node.id];
                let mut best_comm = current_comm;
                let mut best_gain = 0.0;

                // Try moving node to each neighbor's community
                let mut candidate_comms: HashSet<usize> = HashSet::new();
                candidate_comms.insert(current_comm);

                if let Some(neighbors) = adj.get(&node.id) {
                    for (neighbor, _) in neighbors {
                        candidate_comms.insert(communities[neighbor]);
                    }
                }

                for &candidate in &candidate_comms {
                    let gain =
                        self.modularity_gain(&node.id, current_comm, candidate, &adj, &communities);
                    if gain > best_gain {
                        best_gain = gain;
                        best_comm = candidate;
                        improved = true;
                    }
                }

                communities.insert(node.id.clone(), best_comm);
            }
        }

        // Relabel communities to be contiguous (0, 1, 2, ...)
        let mut mapping: std::collections::BTreeMap<usize, usize> = std::collections::BTreeMap::new();
        let mut next_label = 0;
        for node in &self.nodes {
            let old_label = communities[&node.id];
            if let std::collections::btree_map::Entry::Vacant(e) = mapping.entry(old_label) {
                e.insert(next_label);
                next_label += 1;
            }
        }

        for node in &self.nodes {
            let old_label = communities[&node.id];
            communities.insert(node.id.clone(), mapping[&old_label]);
        }

        communities
    }

    fn modularity_gain(
        &self,
        node_id: &str,
        old_comm: usize,
        new_comm: usize,
        adj: &HashMap<String, Vec<(String, usize)>>,
        communities: &BTreeMap<String, usize>,
    ) -> f64 {
        let neighbors = adj.get(node_id).cloned().unwrap_or_default();

        let mut old_edges = 0;
        let mut new_edges = 0;

        for (neighbor, weight) in neighbors {
            let neighbor_comm = communities[&neighbor];
            if neighbor_comm == old_comm {
                old_edges += weight;
            }
            if neighbor_comm == new_comm && old_comm != new_comm {
                new_edges += weight;
            }
        }

        (new_edges as f64) - (old_edges as f64)
    }
}

/// Convert network to GraphML format (for Gephi/Cytoscape).
pub fn network_to_graphml(network: &SocialNetwork) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<graphml xmlns=\"http://graphml.graphdrawing.org/xmlns\">\n");
    xml.push_str(
        "  <key id=\"workload\" for=\"node\" attr.name=\"workload\" attr.type=\"long\"/>\n",
    );
    xml.push_str("  <key id=\"weight\" for=\"edge\" attr.name=\"weight\" attr.type=\"long\"/>\n");
    xml.push_str("  <graph edgedefault=\"undirected\">\n");

    for node in &network.nodes {
        let _ = write!(xml, "    <node id=\"{}\"", escape_xml(&node.id));
        if let Some(label) = &node.label {
            let _ = write!(xml, " label=\"{}\"", escape_xml(label));
        }
        xml.push_str(">\n");
        if let Some(workload) = node.workload {
            let _ = write!(xml, "      <data key=\"workload\">{}</data>\n", workload);
        }
        xml.push_str("    </node>\n");
    }

    for edge in &network.edges {
        let _ = write!(
            xml,
            "    <edge source=\"{}\" target=\"{}\">\n",
            escape_xml(&edge.from),
            escape_xml(&edge.to)
        );
        let _ = write!(xml, "      <data key=\"weight\">{}</data>\n", edge.weight);
        xml.push_str("    </edge>\n");
    }

    xml.push_str("  </graph>\n");
    xml.push_str("</graphml>\n");
    xml
}

/// Convert network to CSV edge list format.
pub fn network_to_csv(network: &SocialNetwork) -> String {
    let mut csv = String::from("from,to,weight\n");
    for edge in &network.edges {
        let _ = write!(csv, "{},{},{}\n", edge.from, edge.to, edge.weight);
    }
    csv
}

fn escape_xml(s: &str) -> String {
    s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_network() -> SocialNetwork {
        SocialNetwork {
            nodes: vec![
                NetworkNode {
                    id: "A".to_string(),
                    label: Some("Alice".to_string()),
                    workload: Some(5),
                },
                NetworkNode {
                    id: "B".to_string(),
                    label: Some("Bob".to_string()),
                    workload: Some(4),
                },
                NetworkNode {
                    id: "C".to_string(),
                    label: Some("Charlie".to_string()),
                    workload: Some(3),
                },
                NetworkNode {
                    id: "D".to_string(),
                    label: Some("Dana".to_string()),
                    workload: Some(2),
                },
            ],
            edges: vec![
                NetworkEdge {
                    from: "A".to_string(),
                    to: "B".to_string(),
                    weight: 5,
                },
                NetworkEdge {
                    from: "B".to_string(),
                    to: "C".to_string(),
                    weight: 3,
                },
                NetworkEdge {
                    from: "C".to_string(),
                    to: "A".to_string(),
                    weight: 2,
                },
                NetworkEdge {
                    from: "B".to_string(),
                    to: "D".to_string(),
                    weight: 1,
                },
            ],
        }
    }

    #[test]
    fn test_degree_centrality() {
        let network = create_test_network();
        let centrality = network.degree_centrality();

        // A connects to B, C: degree 2
        // B connects to A, C, D: degree 3
        // C connects to B, A: degree 2
        // D connects to B: degree 1
        assert!(centrality["A"] > 0.0);
        assert!(centrality["B"] > centrality["A"]); // B is more central
    }

    #[test]
    fn test_clustering_coefficient() {
        let network = create_test_network();
        let (global, local) = network.clustering_coefficient();

        assert!(global >= 0.0 && global <= 1.0);
        assert_eq!(local.len(), 4);

        // Triangle A-B-C exists
        assert!(local["A"] > 0.0);
    }

    #[test]
    fn test_community_detection() {
        let network = create_test_network();
        let communities = network.community_detection();

        assert_eq!(communities.len(), 4);
        // A, B, C should likely be in same community (triangle)
        assert_eq!(communities["A"], communities["B"]);
        assert_eq!(communities["B"], communities["C"]);
    }

    #[test]
    fn test_graphml_export() {
        let network = create_test_network();
        let graphml = network_to_graphml(&network);

        assert!(graphml.contains("<?xml"));
        assert!(graphml.contains("<graphml"));
        assert!(graphml.contains("<node id=\"A\""));
        assert!(graphml.contains("<edge source=\"A\" target=\"B\""));
    }
}
