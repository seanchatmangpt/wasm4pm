# Uncertain Firsts — ACADEMIC-LINEAGE-001

*Algorithms where the "first accepted" claim is disputed, unclear, or cannot be verified without DBLP/DOI access.*

**Honest position:** "We do not know" is a valid academic answer. Fabricating citations is not.

---

## Disputed / Unknown Firsts

### `hill_climbing` (Petri net discovery via hill-climbing)

**Status:** No accepted PM-specific hill-climbing paper found.

**What we know:**
- Hill-climbing as a general optimization heuristic is classical CS (no single "first paper")
- Applied to process model discovery by adapting fitness/precision metrics as the objective function
- Several papers reference HC-based discovery informally (e.g., as a baseline)

**Honest classification:** `derived` — general HC adapted for PM, no canonical PM paper.

**Action needed:** Manual search for "hill climbing process discovery" in DBLP/IEEE/ACM.

---

### `simulated_annealing` (SA-based Petri net search)

**Status:** Generic SA origin is clear (Kirkpatrick, Gelatt, Vecchi 1983, *Science*). PM-specific application is engineering.

**What we know:**
- Kirkpatrick et al. 1983 is the canonical SA paper (1,000+ citations)
- Applying SA to process model search: no single authoritative PM paper
- SA used as a search strategy in several PM tools but not formalized as a named PM object

**Honest classification:** `derived` — SA is the origin method, PM adaptation is engineering practice.

**Action needed:** Check if Buijs et al. or De Medeiros et al. published an SA-PM paper.

---

### `causal_graph` (Causal inference on event logs)

**Status:** Multiple papers use causal graphs in PM contexts. No single "first" identified.

**What we know:**
- Causal graph analysis in PM: Greco et al. 2006 (causality in workflow logs), various later papers
- The wasm4pm `causal_graph` algorithm is a DFG variant with causal inference annotations
- Not a direct implementation of any single named formal object from one paper

**Honest classification:** `derived` — causal graph family, multiple competing papers.

**Action needed:** Identify whether the implementation most closely follows Greco et al. 2006 or a later formalization.

---

### `ocel_ocla` (Object-Centric Log Abstraction)

**Status:** OCLA as a named formal object: attribution unclear.

**What we know:**
- Object-centric event logs were formalized by Ghahfarokhi et al. 2021 (ICSOC)
- OCLA (log abstraction) is closely related but the exact definition source is unclear
- May be from a companion paper or informally defined in tool documentation

**Honest classification:** `derived` from `ghahfarokhi_et_al_ocel_2021` family.

**Action needed:** Check if a separate OCLA paper exists in IEEE/ACM or if it's defined in the OCEL 2.0 standard.

---

### Alpha Family (alpha vs. alpha+ vs. alpha++)

**Status:** Three distinct papers, often conflated.

**Clarification:**
- **Alpha (original):** van der Aalst, Weijters, Maruster 2004 — discovers sound WF-nets from complete logs
- **Alpha+ (length-1/2 loops):** van der Aalst & Weijters 2004 extended version
- **Alpha++ (non-free-choice):** Wen, van der Aalst, Wang, Sun 2007 — handles non-free-choice constructs

**Implementation note:** The wasm4pm `alpha_plus_plus` implementation likely implements the Alpha++ variant. Confirm against `wasm4pm/src/more_discovery.rs`.

**Honest classification:** `direct` — Wen et al. 2007 is the canonical Alpha++ paper.

---

### Genetic Algorithm vs. ACO (shared lineage)

**Status:** Both genetic algorithm and ACO discovery use De Medeiros et al. as the family reference, but these are different algorithms.

**What we know:**
- De Medeiros et al. 2003: Genetic process mining (first evolutionary PM paper)
- De Medeiros et al. 2007: Genetic algorithm + ACO comparison for PM
- The ACO adaptation for PM is not a standalone paper separate from the genetic algorithm line

**Honest classification:** Both `derived` from `de_medeiros_et_al_2007_genetic` family.

**Action needed:** Confirm whether a standalone ACO-PM paper exists (Medeiros used both GA and ACO in the same 2007 paper).

---

## Items That Are NOT Uncertain (for completeness)

These first claims are high-confidence and do not need further research:

| Algorithm | Canonical First | Confidence |
|---|---|---|
| `inductive_miner` | Leemans et al. 2013 (PETRI NETS) | high |
| `heuristic_miner` | Weijters & van der Aalst 2003 (CogSci) | high |
| `alignments` | Adriansyah 2014 (PhD thesis) | high |
| `etconformance_precision` | Munoz-Gama & Carmona 2010 (PETRI NETS) | high |
| `powl_to_process_tree` | Kourani, Park, van der Aalst 2026 (arXiv:2602.15739v3) | high |
| `handover_network` | van der Aalst et al. 2005 (IEEE TSC) | high |
| `ocel_petri_net` | van der Aalst & Berti 2020 (Springer) | high |
| `declare` | Pesic & van der Aalst 2006; Pesic 2008 (PhD) | high |

---

## Verification Path (when DBLP access is available)

For each uncertain first:
1. Query DBLP: `https://dblp.org/search/publ?q=<algorithm+name>+process+mining`
2. Filter to conference/journal papers (rank 1 in source hierarchy)
3. Check earliest accepted paper by year
4. Update `first_peer_reviewed` in `ALGORITHM_LINEAGE.toml`
5. Re-run gate verification

*Note: DBLP rate-limits automated queries aggressively. Manual verification via browser is the reliable path.*
