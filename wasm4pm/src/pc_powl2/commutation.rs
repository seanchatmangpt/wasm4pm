use super::*;

impl<'a, D: FiniteStateDomain> PcPowl2Checker<'a, D> {
    /// Relationally compose two certified child proofs for one admitted state.
    ///
    /// This is the executable commutation law used for incomparable partial-order
    /// children. It evaluates the same proof constructors as the main checker and
    /// returns every admitted successor, rather than comparing action labels or a
    /// single chosen serialization.
    pub(super) fn compose_terms(
        &self,
        certificate: &CertifiedPowl,
        first: &ProofTerm,
        second: &ProofTerm,
        state: &D::State,
    ) -> PcpResult<HashSet<D::State>> {
        let mut visits = 0usize;
        let mut outputs = HashSet::new();
        for intermediate in self.commutation_outputs(certificate, first, state, &mut visits)? {
            outputs.extend(self.commutation_outputs(
                certificate,
                second,
                &intermediate,
                &mut visits,
            )?);
        }
        Ok(outputs)
    }

    fn commutation_outputs(
        &self,
        certificate: &CertifiedPowl,
        proof: &ProofTerm,
        state: &D::State,
        visits: &mut usize,
    ) -> PcpResult<HashSet<D::State>> {
        *visits = visits.saturating_add(1);
        if *visits > certificate.bounds.max_choice_visits {
            return Err(PcpRefusal::ChoiceVisitBoundExceeded {
                actual: *visits,
                maximum: certificate.bounds.max_choice_visits,
            });
        }

        let (pre, post) = proof.contract();
        if !self.domain.holds(pre, state)? {
            return Ok(HashSet::new());
        }
        let node = model_node(&certificate.model, proof.node())?;
        let outputs = match proof {
            ProofTerm::Boundary { .. } => HashSet::from([state.clone()]),
            ProofTerm::Atom { .. } => {
                let PowlNodeKind::Atom(action) = &node.kind else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let next = self.domain.step(action, state).map_err(|reason| {
                    PcpRefusal::ActionRefused {
                        node: node.id,
                        reason,
                    }
                })?;
                HashSet::from([next])
            }
            ProofTerm::Consequence { inner, .. } => {
                self.commutation_outputs(certificate, inner, state, visits)?
            }
            ProofTerm::PartialOrder {
                canonical,
                children,
                ..
            } => {
                let children = proof_map(children);
                let mut current = HashSet::from([state.clone()]);
                for child_id in canonical {
                    let child = children
                        .get(child_id)
                        .copied()
                        .ok_or(PcpRefusal::UnknownNode { node: *child_id })?;
                    let mut next = HashSet::new();
                    for current_state in current {
                        next.extend(self.commutation_outputs(
                            certificate,
                            child,
                            &current_state,
                            visits,
                        )?);
                    }
                    current = next;
                }
                current
            }
            ProofTerm::ChoiceGraph { nodes, .. } => {
                let PowlNodeKind::ChoiceGraph {
                    nodes: graph_nodes,
                    edges,
                } = &node.kind
                else {
                    return Err(PcpRefusal::RuleDoesNotMatchNode { node: node.id });
                };
                let (start, finish) = choice_terminals(&certificate.model, graph_nodes)?;
                let contracts: HashMap<_, _> =
                    nodes.iter().map(|entry| (entry.node, entry)).collect();
                let adjacency = graph_adjacency(edges);
                let mut queue = VecDeque::from([(start, state.clone())]);
                let mut seen = HashSet::new();
                let mut outputs = HashSet::new();
                while let Some((current_node, current_state)) = queue.pop_front() {
                    if !seen.insert((current_node, current_state.clone())) {
                        continue;
                    }
                    *visits = visits.saturating_add(1);
                    if *visits > certificate.bounds.max_choice_visits {
                        return Err(PcpRefusal::ChoiceVisitBoundExceeded {
                            actual: *visits,
                            maximum: certificate.bounds.max_choice_visits,
                        });
                    }
                    let contract = contracts
                        .get(&current_node)
                        .ok_or(PcpRefusal::UnknownNode { node: current_node })?;
                    for output in self.commutation_outputs(
                        certificate,
                        &contract.proof,
                        &current_state,
                        visits,
                    )? {
                        if current_node == finish {
                            outputs.insert(output);
                        } else if let Some(next_nodes) = adjacency.get(&current_node) {
                            for next in next_nodes {
                                queue.push_back((*next, output.clone()));
                            }
                        }
                    }
                }
                outputs
            }
        };

        for output in &outputs {
            if !self.domain.holds(post, output)? {
                return Err(match proof {
                    ProofTerm::Atom { .. } => PcpRefusal::AtomicContractFailed { node: node.id },
                    _ => PcpRefusal::CanonicalContractFailed { node: node.id },
                });
            }
        }
        Ok(outputs)
    }
}
