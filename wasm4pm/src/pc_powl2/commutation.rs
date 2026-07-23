use super::*;

impl<'a, D: FiniteStateDomain> PcPowl2Checker<'a, D> {
    /// Relationally compose two certified proof terms over one admitted state.
    ///
    /// Both operands are interpreted by the same recursive denotational kernel
    /// used by partial-order, choice-graph, cycle, and consequence verification.
    /// This prevents a nested partial order from being silently collapsed to its
    /// author-selected canonical serialization during a commutation proof.
    pub(super) fn compose_terms(
        &self,
        certificate: &CertifiedPowl,
        first: &ProofTerm,
        second: &ProofTerm,
        state: &D::State,
    ) -> PcpResult<HashSet<D::State>> {
        let mut visits = 0usize;
        let mut outputs = HashSet::new();
        for intermediate in self.outputs_for_term(certificate, first, state, &mut visits)? {
            outputs.extend(self.outputs_for_term(
                certificate,
                second,
                &intermediate,
                &mut visits,
            )?);
        }
        Ok(outputs)
    }
}
