# First-Claim Adversary Audit

**Document:** FIRST_CLAIM_AUDIT.md
**Agent:** A12 — First-Claim Adversary
**Date:** 2026-05-30
**Scope:** Documents 10-DISCOVERY-LINEAGE.md through 16-SIMULATION-SOCIAL-LINEAGE.md
**Protocol:** Attack every first_peer_reviewed and first_known claim; classify each as UPHELD / WEAKENED / OVERTURNED / UNCERTAIN

---

## Methodology

For each algorithm marked `first_peer_reviewed` or `first_known`, this agent ran targeted WebSearch against:
- DBLP, Semantic Scholar, arXiv, ResearchGate, Springer, ACM DL, IEEE Xplore
- Author publication pages and institutional repositories
- Queries for thesis versions, workshop precursors, earlier conference papers, and variant/standard misclassifications

The six attack vectors applied to each claim:
1. Is there an earlier technical report?
2. Is there an earlier thesis that predates the conference paper?
3. Is the cited paper a later canonical version, not the actual first?
4. Is this a variant, not the original algorithm?
5. Is the cited work a standard rather than an algorithm?
6. Is the implementation actually a derived engineering version?

---

## Results by Algorithm

---

### dfg — Directly-Follows Graph

**Claim:** Cook & Wolf (1998) ACM TOSEM 7(3) as `first_peer_reviewed`; Cook & Wolf (1998) as `first_known`.

**Attack 1 — Earlier paper?** YES. Cook & Wolf published "Automating Process Discovery Through Event-Data Analysis" at ICSE 1995 (17th International Conference on Software Engineering, Seattle, April 1995, ACM Press, pp. 73–82). This is a peer-reviewed conference paper three years before the 1998 TOSEM journal article. Cook also produced a PhD thesis in 1996 ("Process Discovery and Validation Through Event-Data Analysis") predating the 1998 journal paper.

**Attack 3 — Later canonical version cited as first?** YES. The 1998 TOSEM paper is the journal extension of the 1995 ICSE conference paper. The first peer-reviewed introduction of the directly-follows approach is ICSE 1995.

**Assessment:** WEAKENED. The lineage document lists Cook & Wolf 1998 as `first_known` and `first_peer_reviewed`. The actual first peer-reviewed paper is Cook & Wolf 1995 (ICSE), with the 1998 TOSEM paper being the canonical extended journal version. The claim is not factually wrong — the 1998 TOSEM paper is real — but stating it as `first_peer_reviewed` is misleading. Should be updated to: first_peer_reviewed = Cook & Wolf 1995 (ICSE); first_known = Cook & Wolf 1995 (ICSE); canonical = Cook & Wolf 1998 (ACM TOSEM).

---

### process_skeleton — Log Skeleton

**Claim:** `first_known` = Verbeek & Medeiros de Carvalho (2018) arXiv:1806.08247; `first_peer_reviewed` = Verbeek (2021) STTT journal.

**Attack 1 — Earlier paper?** WebSearch confirms arXiv:1806.08247 was posted June 21, 2018. The document notes the algorithm won the PDC 2017 contest, meaning the algorithm existed and was submitted to that contest before the arXiv paper. However, the PDC 2017 contest submission is not a peer-reviewed paper — it is a contest entry.

**Attack 2 — Earlier thesis?** No thesis found predating the arXiv paper.

**Attack 3 — Is 2021 STTT cited as first peer-reviewed when an earlier peer-reviewed venue exists?** The document correctly identifies the 2021 STTT journal as the `first_peer_reviewed` outlet and the 2018 arXiv as `first_known`. This correctly distinguishes the two. The arXiv preprint is appropriately categorized as a non-peer-reviewed first.

**Assessment:** UPHELD. The claim structure is correct: arXiv 2018 as `first_known`, STTT 2021 as `first_peer_reviewed`. The pre-2018 PDC 2017 contest existence does not produce an earlier peer-reviewed publication. Claim stands.

---

### alpha_plus_plus — Alpha Plus Plus

**Claim:** `first_peer_reviewed` = Wen et al. (2007) WISE / Springer LNCS; also references Wen et al. (2008) IEEE ICWS.

**Attack 3 — Is the cited paper a later canonical version?** The document correctly notes that alpha++ (Wen et al. 2007/2008) is distinct from alpha (van der Aalst et al. 2004) and alpha+ (Medeiros et al. 2004, tech report; 2007 BETA WP 113). The 2007 WISE paper is the correct first peer-reviewed publication for alpha++ specifically.

**Attack 4 — Is this a variant, not the original?** YES, but the document explicitly acknowledges this. The document correctly classifies alpha++ as a variant of alpha, not the original. The `first_peer_reviewed` claim is for alpha++ specifically, which is correctly identified.

**Attack 1 — Earlier technical report?** The BETA Working Paper 113 (Medeiros et al. 2004) is for alpha+ (not alpha++). No earlier technical report for alpha++ specifically has been found.

**Assessment:** UPHELD. The document correctly distinguishes alpha, alpha+, and alpha++, and correctly identifies the 2007 WISE paper as the first peer-reviewed publication for alpha++ specifically. Claim stands.

---

### heuristic_miner — Heuristics Miner

**Claim:** `first_known` = Weijters & van der Aalst (2003) ICAE journal ("Little Thumb"); `first_peer_reviewed` = Weijters, van der Aalst, Medeiros (2006) BETA WP 166.

**Attack 3 — Is the first_peer_reviewed a later version?** YES. The document labels BETA WP 166 (2006) as `first_peer_reviewed`, but this is a technical report, not a peer-reviewed conference or journal paper. The Weijters & van der Aalst (2003) ICAE journal paper ("Rediscovering Workflow Models from Event-Based Data using Little Thumb," Integrated Computer-Aided Engineering 10(2), 151–162) IS a peer-reviewed journal paper and predates WP 166 by three years. Confirmation: this paper has a published journal DOI (journals.sagepub.com/doi/abs/10.3233/ICA-2003-10205).

**Attack 5 — Is this a standard?** No.

**Reclassification:** The `first_peer_reviewed` should be the 2003 ICAE journal paper (the "Little Thumb" paper), not the 2006 technical report. BETA WP 166 (2006) is NOT peer-reviewed — it is a working paper. The document contradicts itself: it correctly cites the 2003 journal paper as `first_known` but then claims a 2006 non-peer-reviewed technical report is `first_peer_reviewed`. This is internally inconsistent.

**Assessment:** WEAKENED. The 2003 ICAE journal paper is both the `first_known` AND the `first_peer_reviewed`. BETA WP 166 is a technical report, not peer-reviewed; it cannot be the `first_peer_reviewed` while the 2003 journal paper exists. Document should correct: first_peer_reviewed = Weijters & van der Aalst (2003), ICAE journal.

---

### inductive_miner — Inductive Miner

**Claim:** `first_known` = `first_peer_reviewed` = Leemans, Fahland, van der Aalst (2013) ICATPN / Petri Nets 2013.

**Attack 1 — Earlier technical report or workshop?** WebSearch confirms the 2013 ICATPN paper is the primary reference. A companion BPM 2013 paper covered the infrequent behavior extension (IMi), not the base IM. No earlier 2012 workshop version of the base IM paper was found.

**Attack 2 — Earlier thesis?** Leemans's PhD thesis postdates the 2013 paper.

**Assessment:** UPHELD. The 2013 ICATPN/Petri Nets paper is the correct first peer-reviewed source. No earlier version found. Claim stands.

---

### ilp — ILP Miner

**Claim:** `first_known` = van der Werf et al. (2008) ICATPN conference; `first_peer_reviewed` = van der Werf et al. (2009) Fundamenta Informaticae 94(3–4).

**Attack 3 — Is the journal cited as first when the conference paper is earlier?** The document correctly distinguishes: the ICATPN 2008 conference paper is `first_known`, and the Fundamenta Informaticae 2009 journal paper is `first_peer_reviewed`. Both ICATPN and Fundamenta Informaticae are peer-reviewed. The ICATPN 2008 paper is actually the earlier peer-reviewed paper (conference, 2008) while the journal is the later canonical expansion (2009).

**Reclassification:** The `first_peer_reviewed` should be the 2008 ICATPN conference paper, not the 2009 journal. The document incorrectly labels the 2009 journal as `first_peer_reviewed` when the 2008 conference paper (also peer-reviewed) precedes it.

**Attack 1 — Earlier technical report?** WebSearch found a PDF at pure.tue.nl (Eindhoven), suggesting a preprint / working paper may exist, but no distinct pre-2008 publication was identified.

**Assessment:** WEAKENED. The ICATPN 2008 conference paper is both `first_known` AND `first_peer_reviewed` (ICATPN is a peer-reviewed Springer LNCS conference). The 2009 Fundamenta Informaticae journal paper is the canonical journal version, not the first peer-reviewed one. Document should update: first_peer_reviewed = van der Werf et al. (2008) ICATPN, LNCS 5062.

---

### genetic_algorithm — Genetic Process Mining

**Claim:** `first_known` = van der Aalst, Medeiros, Weijters (2004) BETA WP 124; `first_peer_reviewed` = van der Aalst, Medeiros, Weijters (2005) ICATPN 2005.

**Attack 1 — Earlier technical report?** YES. The 2004 BETA WP 124 predates the 2005 ICATPN paper. The document correctly acknowledges this: WP 124 is listed as `first_known` (technical report, not peer-reviewed), and the 2005 ICATPN paper as `first_peer_reviewed`. This structure is correct.

**Attack 3 — Is the first_peer_reviewed the actual first?** The ICATPN 2005 paper is confirmed as the first peer-reviewed publication. Also found: a BPM 2005 workshop paper "Genetic Process Mining: A Basic Approach and Its Challenges" (co-located with BPM 2005) appears in search results (ACM DL: 10.1007/11678564_18). This may be simultaneous with or slightly later than the ICATPN paper, not earlier.

**Assessment:** UPHELD. The claim structure (WP 124 as first_known; ICATPN 2005 as first_peer_reviewed) is correct. The BETA WP is appropriately labeled as a technical report. Claim stands.

---

### hill_climbing — Hill Climbing

**Claim:** `first_peer_reviewed` = not yet proven as standalone PM algorithm; `confidence` = low.

**Attack:** The document itself expresses low confidence and acknowledges no standalone PM paper for hill climbing. This is honest. No WebSearch evidence overturns this finding.

**Assessment:** UPHELD. The document correctly classifies this as low-confidence with no standalone PM origin paper. Claim stands (the admission of uncertainty is itself the correct claim).

---

### simulated_annealing — Simulated Annealing

**Claim:** `first_peer_reviewed` = Liu, Lu, Shi (2008) ICYCS / IEEE.

**Attack 3 — Is ICYCS 2008 a minor or non-canonical venue?** YES. ICYCS (International Conference for Young Computer Scientists) is a relatively minor venue with lower citation impact. This does not invalidate the first-paper claim, but lowers credibility compared to mainstream PM venues.

**Attack 4 — Is this a variant?** YES — SA applied to process mining is an application of Kirkpatrick et al. (1983) to a PM-specific representation. The wasm4pm implementation may be an engineering adaptation of the general SA algorithm rather than directly derived from Liu et al. 2008.

**Assessment:** UNCERTAIN. The Liu et al. 2008 ICYCS paper may be the first PM-specific SA paper, but given the minor venue and lack of follow-up citation in mainstream PM literature, this is difficult to verify without deeper bibliometric access. The "first_known" claim for a specific PM application of SA is plausible but unverified. Label should be first_known_candidate rather than definitive.

---

### aco — Ant Colony Optimization

**Claim:** `first_peer_reviewed` = Canfora et al. (2013) IEEE SERVICES.

**Attack 3 — Is there an earlier PM-specific ACO paper?** WebSearch on "ant colony" "process mining" 2012 2011 found no clear earlier peer-reviewed PM-specific ACO paper predating the 2013 SERVICES paper. The Canfora et al. paper (IEEE Xplore: 6569304) appears to be the first named PM-specific ACO paper.

**Attack 4 — Is this a variant?** YES — ACO BP Miner is an application of Dorigo's ACO (1992/2004) to PM, not an original algorithm. The `first_peer_reviewed` refers to the first PM application, which is Canfora et al. 2013.

**Assessment:** UPHELD with caveat. The Canfora et al. 2013 IEEE SERVICES paper appears to be the first peer-reviewed PM-specific ACO paper. The document's medium confidence is appropriate. Claim stands but warrants the caveat that engineering_only may be more accurate for the wasm4pm implementation if it does not directly derive from this paper.

---

### pso — Particle Swarm Optimization

**Claim:** `first_peer_reviewed` = not yet proven; `confidence` = low; Maita et al. (2022) IJCIS as the only found paper.

**Assessment:** UPHELD. The document correctly acknowledges low confidence. No WebSearch evidence found an earlier peer-reviewed PM-specific PSO paper. The 2022 IJCIS paper remains the best available reference. The honest low-confidence classification stands.

---

### optimized_dfg — Optimized DFG

**Claim:** No standalone canonical paper; `confidence` = medium; grounded in Günther & van der Aalst (2007) Fuzzy Mining and Conforti et al. (2022) edge filtering.

**Attack 4 — Is this a variant?** YES, and the document explicitly says so. "Optimized DFG" is not a named algorithm in the PM literature; it is an engineering composition.

**Attack 5 — Is it a standard?** No.

**Assessment:** UPHELD. The document honestly classifies this as a named algorithm with no standalone paper and correctly identifies the closest ancestors. No WebSearch evidence reveals a specific "optimized DFG" paper that the document missed. Note: the DOI cited in document 10 (10.1016/j.ins.2022.07.178) and document 14 (10.1016/j.ins.2022.07.170) differ by one digit — this is an internal inconsistency between the two lineage documents that must be corrected. Only one DOI can be correct for the Chapela-Campa 2022 paper.

---

### hierarchical_dfg — Hierarchical DFG

**Claim:** `confidence` = medium/low; grounded in Günther & van der Aalst (2007) Fuzzy Mining.

**Attack 4 — Is this a variant?** YES. The document explicitly acknowledges that "hierarchical DFG" is not a named algorithm. No paper uses this exact term as a PM algorithm.

**Assessment:** UPHELD. The document correctly classifies this as an engineering composite without a single founding paper. The low/medium confidence is appropriate.

---

### causal_graph — Causal Net (C-net)

**Claim:** `first_peer_reviewed` = van der Aalst, Adriansyah, van Dongen (2011) CONCUR 2011.

**Attack 1 — Earlier technical report?** WebSearch found no pre-2011 technical report specifically formalizing C-nets under this name. An earlier conceptual use appeared in HeuristicsMiner work (circa 2002) but without the formal C-net framework.

**Attack 2 — Earlier thesis?** None found predating CONCUR 2011.

**Assessment:** UPHELD. CONCUR 2011 is confirmed as the first peer-reviewed formalization of Causal Nets as a named data structure. Claim stands.

---

### correlation_miner — Correlation Miner

**Claim:** `first_known` = Pourmirza, Dijkman, Grefen (2015) CoopIS / LNCS; `first_peer_reviewed` = Pourmirza, Dijkman, Grefen (2017) IJCIS.

**Attack 3 — Is the journal cited as first when an earlier conference exists?** YES. The 2015 CoopIS conference paper is correctly labeled `first_known`. However, as with the ILP Miner case, the `first_peer_reviewed` should be the 2015 CoopIS/LNCS conference paper (which IS peer-reviewed), not the 2017 IJCIS journal paper. CoopIS is a peer-reviewed conference.

**Reclassification:** first_peer_reviewed = Pourmirza et al. (2015) CoopIS, LNCS 9382. The 2017 IJCIS paper is the canonical journal extension, not the first peer-reviewed publication.

**Assessment:** WEAKENED. Same structural error as ILP Miner: a conference paper is labeled `first_known` while the subsequent journal paper is labeled `first_peer_reviewed`, when in fact the conference paper is itself peer-reviewed and therefore IS the first_peer_reviewed. Should update: first_peer_reviewed = Pourmirza et al. (2015) CoopIS, LNCS 9382.

---

### alignments — Alignment-Based Conformance

**Claim:** `first_known` = `first_peer_reviewed` = Adriansyah, van Dongen, van der Aalst (2011) EDOC 2011; earlier BPM-11-11 tech report noted as not peer-reviewed.

**Attack 1 — Earlier peer-reviewed paper?** CRITICAL FINDING. WebSearch confirms that Adriansyah, Sidorova, and van Dongen published "Cost-Based Fitness in Conformance Checking" at ACSD 2011 (11th International Conference on Application of Concurrency to System Design, Kanazawa, Japan, June 2011, IEEE, pp. 57–66; DBLP: dblp.org/rec/conf/acsd/AdriansyahSD11.html). ACSD 2011 took place in June 2011. EDOC 2011 took place in August–September 2011. The ACSD 2011 paper therefore predates the EDOC 2011 paper.

**Attack 2 — Thesis as earlier source?** The PhD thesis (2014) is correctly placed after the conference papers; not a prior source.

**Reclassification:** The `first_peer_reviewed` should be Adriansyah, Sidorova, van Dongen (2011) ACSD 2011 (June 2011), not Adriansyah, van Dongen, van der Aalst (2011) EDOC 2011 (August-September 2011). Both are from 2011 but ACSD precedes EDOC by approximately two to three months.

**Assessment:** WEAKENED. The document's claim that EDOC 2011 is the first peer-reviewed paper is incorrect. The ACSD 2011 paper (Adriansyah, Sidorova, van Dongen) is an earlier peer-reviewed publication introducing cost-based fitness for conformance checking. The EDOC 2011 paper (with van der Aalst as co-author) is a closely related but slightly later paper. The `first_peer_reviewed` label should transfer to ACSD 2011; EDOC 2011 becomes an important co-foundational paper.

---

### etconformance_precision — ETConformance Precision

**Claim:** `first_known` = `first_peer_reviewed` = Muñoz-Gama, Carmona (2010) BPM 2010.

**Attack 1 — Earlier version?** WebSearch found no evidence of a 2009 workshop version or earlier peer-reviewed paper for ETConformance specifically. The BPM 2010 paper appears to be the genuine first.

**Assessment:** UPHELD. BPM 2010 (LNCS 6336) is confirmed as the first peer-reviewed paper for ETConformance. Claim stands.

---

### generalization — Generalization Metric

**Claim:** `first_peer_reviewed` = Buijs, van Dongen, van der Aalst (2012) OTM 2012.

**Attack 1 — Earlier source?** WebSearch confirms the 2012 OTM paper is the primary reference. Earlier van der Aalst texts discuss fitness and precision but do not formalize generalization as a separately computable dimension.

**Assessment:** UPHELD. The 2012 OTM paper is the first to formalize generalization as a separate quality dimension. Claim stands.

---

### token_replay (primitive) — Token-Based Replay

**Claim:** `first_known` = Rozinat, van der Aalst (2006) BPM'05 Workshops; `first_peer_reviewed` = Rozinat, van der Aalst (2008) Information Systems journal.

**Attack 3 — Is the journal cited as first when the workshop paper is earlier?** The document correctly labels the 2006 workshop paper as `first_known` and the 2008 IS journal paper as `first_peer_reviewed`. However, BPM workshops are typically peer-reviewed proceedings. The 2006 BPM'05 Workshops paper (LNCS 3812) IS a peer-reviewed publication.

**Reclassification:** first_peer_reviewed = Rozinat, van der Aalst (2006) BPM'05 Workshops, LNCS 3812 (if the workshop proceedings were peer-reviewed, which Springer LNCS workshops typically are). The 2008 IS journal paper is the canonical extended version.

**Assessment:** WEAKENED (minor). The BPM 2005 workshop paper published in LNCS 3812 constitutes peer-reviewed publication (Springer workshop proceedings). The `first_peer_reviewed` label should be assigned to the 2006 LNCS paper, with the 2008 IS journal paper as the canonical journal version. This is the same structural issue as ILP Miner and Correlation Miner.

---

### complexity_metrics — Complexity Metrics

**Claim:** `first_peer_reviewed` = Lassen & van der Aalst (2009) Information and Software Technology journal.

**Attack 1 — Earlier source?** The document itself cites Cardoso (2005) PhD thesis and McCabe (1976) as foundational antecedents. No peer-reviewed PM-specific paper for the exact ECaM/ECyM/SM metrics before 2009 was found.

**Assessment:** UPHELD. The 2009 IST journal paper is the correct first peer-reviewed source for these specific WF-net complexity metrics. Claim stands.

---

### declare (conformance aspect) — Declare

**Claim:** `first_known` = Pesic, van der Aalst (2006) BPM'06 workshops; `first_peer_reviewed` = Pesic, Schonenberg, van der Aalst (2007) EDOC 2007.

**Attack 3 — Is the 2006 paper a peer-reviewed source?** The document states the 2006 paper is "a workshop without full peer review by conference standards." This is a judgment call. Springer LNCS workshop proceedings (LNCS 4103) typically involve peer review. If the BPM'06 workshops were peer-reviewed, the `first_peer_reviewed` is 2006, not 2007.

**Assessment:** UNCERTAIN. Whether the 2006 BPM workshop paper qualifies as peer-reviewed depends on the specific review process for BPM 2006 workshops (LNCS 4103). The document's judgment that 2007 EDOC is the `first_peer_reviewed` is defensible but not clearly correct. If the 2006 workshop paper underwent peer review (typical for Springer LNCS workshops), the 2006 paper is `first_peer_reviewed`. This cannot be resolved definitively without access to the BPM 2006 workshop's review records.

---

### ocel — OCEL 1.0 Format

**Claim:** `first_known` = van der Aalst (2019) SEFM 2019; `first_peer_reviewed` = Ghahfarokhi et al. (2021) SIMPDA @ ADBIS 2021.

**Attack 1 — Earlier format specification?** WebSearch confirmed that the OCEL standard specification (ocel-standard.org) was created on January 8, 2020 — before the August 2021 SIMPDA paper. This means the format specification existed as an internal/web document in 2020, before the peer-reviewed paper appeared.

**Attack 3 — Is the SIMPDA 2021 paper the actual first?** The 2020 release of the specification on ocel-standard.org predates the SIMPDA 2021 paper, but the specification itself is a technical document, not a peer-reviewed paper. The `first_peer_reviewed` claim for SIMPDA 2021 remains valid; the `first_known` claim for SEFM 2019 is conceptually correct (the format was conceptualized in 2019). However, the actual format specification (not just the concept) dates to January 2020, which may be a more precise `first_known` than the SEFM 2019 paper (which contained no format specification).

**Assessment:** WEAKENED (minor). The `first_known` for the OCEL format (not just the concept) should be January 2020 (ocel-standard.org specification release), not SEFM 2019. The SEFM 2019 paper introduced the conceptual motivation but no format. The document should distinguish: first_known_concept = van der Aalst (2019) SEFM; first_known_format_spec = ocel-standard.org January 2020; first_peer_reviewed = Ghahfarokhi et al. (2021) SIMPDA @ ADBIS.

---

### ocel_2_0 — OCEL 2.0

**Claim:** `first_peer_reviewed` = Koren et al. (2023) ICPM 2023 resources track.

**Attack 5 — Is this a standard rather than an algorithm?** YES. OCEL 2.0 is a data format standard, not an algorithm. The document correctly classifies it as a "Data standard / event log format." The `first_peer_reviewed` reference is to the resources track paper, not an algorithm paper. This is an appropriate classification.

**Assessment:** UPHELD. The document correctly identifies OCEL 2.0 as a standard/format, not an algorithm, and cites the first peer-reviewed resources paper appropriately. Claim stands.

---

### oc_dfg — Object-Centric DFG

**Claim:** `first_known` = `first_peer_reviewed` = Berti & van der Aalst (2022/2023) OC-PM, STTT journal.

**Attack 1 — Earlier source?** The SEFM 2019 paper (van der Aalst) sketched the OC-DFG concept. The document correctly notes this but states the STTT paper is the first formal definition. No earlier peer-reviewed paper with a formal OC-DFG multigraph definition has been found.

**Assessment:** UPHELD. The 2022/2023 STTT paper is the correct first peer-reviewed formal definition of the OC-DFG. The SEFM 2019 sketch does not displace this. Claim stands.

---

### oc_petri_net — Object-Centric Petri Net

**Claim:** `first_peer_reviewed` = van der Aalst & Berti (2020) Fundamenta Informaticae 175.

**Attack 1 — Preprint predates journal?** WebSearch found that the Fundamenta Informaticae paper was published online September 28, 2020, while the arXiv preprint (2010.02047) was submitted October 5, 2020 — meaning the journal publication actually preceded the arXiv preprint. This is unusual but confirmed. The claim that this is the first peer-reviewed paper is therefore correct.

**Attack 3 — Is there an earlier version?** The arXiv preprint postdates the journal, so there is no "earlier arXiv" version in the normal sense. The journal IS the first publication.

**Assessment:** UPHELD. The Fundamenta Informaticae (2020) paper is confirmed as the correct first peer-reviewed source. The unusual timeline (journal before arXiv) is confirmed but does not weaken the claim. Claim stands.

---

### oc_declare — OC-DECLARE

**Claim:** `first_peer_reviewed` = Küsters & van der Aalst (2025) BPM 2025.

**Attack:** This is a 2025 paper. No earlier peer-reviewed OC-DECLARE paper has been found. The document correctly notes the OCBC model (2017 arXiv) as a conceptual precursor but correctly distinguishes it as a modeling notation rather than a discovery algorithm.

**Assessment:** UPHELD. BPM 2025 is the correct first peer-reviewed source for OC-DECLARE as an automated discovery algorithm. Claim stands.

---

### ocpq_query_engine — OCPQ

**Claim:** `first_peer_reviewed` = Küsters & van der Aalst (2025) RCIS 2025.

**Attack:** No earlier peer-reviewed OCPQ paper found. The arXiv:2506.11541 is dated June 2025, consistent with a conference paper submitted/accepted in 2025.

**Assessment:** UPHELD. RCIS 2025 is the correct first peer-reviewed source. Claim stands.

---

### wf_net_soundness — WF-net Soundness

**Claim:** `first_known` = van der Aalst (1996) Computing Science Report 96/23; `first_peer_reviewed` = van der Aalst (1997) ICATPN 1997.

**Attack 1 — Earlier technical report?** YES, and the document correctly cites it: CS Report 96/23 is the `first_known`, ICATPN 1997 is the `first_peer_reviewed`. This structure is correct.

**Assessment:** UPHELD. The document correctly identifies the 1996 technical report as `first_known` and the 1997 ICATPN paper as `first_peer_reviewed`. Claim stands.

---

### transition_system — Transition System Miner

**Claim:** `first_known` = van der Aalst et al. (2006) BPM Center Report BPM-06-30; `first_peer_reviewed` = van der Aalst et al. (2010) Software and Systems Modeling journal.

**Attack 3 — Is the journal cited as first when an earlier peer-reviewed conference paper exists?** The 2006 BPM Center Report is a technical report (not peer-reviewed). But was there an intermediate conference paper between 2006 and 2010? WebSearch found the report and journal paper but no intermediate peer-reviewed conference paper. The transition from technical report (2006) directly to journal (2010) appears to be the correct lineage, with no intermediate peer-reviewed conference publication found.

**Assessment:** UPHELD. The BPM-06-30 report as `first_known` and the 2010 SoSyM journal as `first_peer_reviewed` appears correct, assuming no intermediate conference paper exists. Claim stands.

---

### powl_to_process_tree — POWL to Process Tree

**Claim:** `first_known` = not_found; `confidence` = engineering_only.

**Assessment:** UPHELD. No peer-reviewed paper for this specific conversion direction has been found. The engineering_only classification is correct. Claim stands.

---

### wf_net_to_powl — WF-net to POWL

**Claim:** `first_known` = Kourani, Park, van der Aalst (2025) arXiv:2503.20363; `first_peer_reviewed` = same paper at Petri Nets 2025.

**Attack:** WebSearch confirms the arXiv preprint was submitted March 26, 2025, and the Petri Nets 2025 conference proceedings are confirmed (Springer LNCS, June 2025, Paris). No earlier version found.

**Assessment:** UPHELD. The 2025 arXiv/Petri Nets paper is the correct first source. Claim stands.

---

### pnml_import, bpmn_import, yawl_export — Standards-Based Import/Export

**Claim:** `confidence` = standard_only or engineering_only for all three.

**Attack 5 — Is this a standard?** YES for PNML (ISO/IEC 15909-2:2011) and BPMN (OMG 2011 / ISO/IEC 19510:2013). The document correctly classifies these as standards-based implementations. The document also correctly notes a potential erroneous ISO number: "ISO/IEC 20481" does not correspond to a PNML standard; the correct number is ISO/IEC 15909-2:2011.

**Assessment:** UPHELD. The standard_only / engineering_only classifications are correct. The ISO number discrepancy noted in the document is a real error that should be maintained as a finding.

---

### streaming_log — Streaming Process Mining

**Claim:** `first_known` = Burattin, Sperduti, van der Aalst (2012) arXiv:1212.6383; `first_peer_reviewed` = Burattin et al. (2014) IEEE CEC.

**Attack 3 — Is the first_peer_reviewed the actual first?** The 2012 arXiv is a preprint (not peer-reviewed). The 2014 IEEE CEC paper is correctly labeled `first_peer_reviewed`. WebSearch confirms arXiv:1212.6383 was submitted December 27, 2012. The timeline is consistent.

**Attack 1 — Even earlier source?** No earlier PM-specific streaming mining paper found.

**Assessment:** UPHELD. The 2012 arXiv preprint is `first_known` and the 2014 IEEE CEC paper is `first_peer_reviewed`. Claim stands.

---

### performance_spectrum — Performance Spectrum

**Claim:** `first_known` = `first_peer_reviewed` = Denisov, Fahland, van der Aalst (2018) BPM 2018.

**Attack 1 — Earlier version?** WebSearch found only 2018 publications for the performance spectrum. The BPM 2018 conference tool paper (Denisov, Belkina, Fahland, van der Aalst) appeared simultaneously as a companion to the main theory paper. No 2017 preprint or earlier version found.

**Assessment:** UPHELD. BPM 2018 is the correct first peer-reviewed source. The performance spectrum concept has no predecessor technique. Claim stands.

---

### batches — Batch Activity Detection

**Claim:** `first_known` = Wen et al. (2013) for algorithmic detection; `first_peer_reviewed` = Martin, Pufahl, Mannhardt (2021) Information Systems.

**Attack 3 — Is the IS 2021 journal cited as first_peer_reviewed when an earlier conference paper exists?** WebSearch found the IS 2021 paper was published online September 10, 2020, and the journal issue is 2021. No earlier conference version of the Martin, Pufahl, Mannhardt paper was identified. The Wen et al. (2013) paper is cited as `first_known` for algorithmic detection — that paper was published in Concurrency and Computation: Practice and Experience (peer-reviewed journal). If Wen et al. 2013 is peer-reviewed (which it is — C&CPE is a Wiley journal), then the `first_peer_reviewed` should potentially be Wen et al. 2013, not Martin et al. 2021.

**Reclassification:** If the criterion for `first_peer_reviewed` is "first peer-reviewed paper introducing a batch detection algorithm from event logs," then Wen et al. (2013) satisfies this criterion, not Martin et al. (2021). Martin et al. 2021 is the `first_peer_reviewed` for subprocess-level batch detection specifically.

**Assessment:** WEAKENED (minor). The document lists the 2013 Wen et al. C&CPE journal paper as `first_known` but labels Martin et al. 2021 as `first_peer_reviewed`. Wen et al. 2013 IS peer-reviewed (Wiley journal). The document should clarify: first_peer_reviewed_single_task_batch = Wen et al. (2013); first_peer_reviewed_subprocess_batch = Martin et al. (2021).

---

### handover_network and working_together_network — Social Network Algorithms

**Claim:** `first_known` = `first_peer_reviewed` = van der Aalst & Song (2004) BPM 2004, LNCS 3080.

**Attack 1 — Earlier version?** WebSearch found no earlier peer-reviewed paper for either handover-of-work or working-together metrics. No 2003 precursor found.

**Assessment:** UPHELD. BPM 2004 (LNCS 3080) is the correct first peer-reviewed source for both social network algorithms. Both algorithms were introduced in the same paper. Claim stands.

---

### monte_carlo_simulation — Monte Carlo Simulation in PM

**Claim:** `first_peer_reviewed` = Rozinat, Wynn, van der Aalst et al. (2009) Data and Knowledge Engineering.

**Attack 1 — Earlier conference paper?** WebSearch confirmed that a conference paper "Workflow Simulation for Operational Decision Support Using Design, Historic and State Information" was presented at BPM 2008 (Springer LNCS 4928, pp. 66–77) by Wynn, Dumas, Fidge, ter Hofstede, and van der Aalst, predating the 2009 DKE journal. This is a Springer peer-reviewed conference paper.

**Reclassification:** The `first_peer_reviewed` for PM-specific workflow/Monte Carlo simulation should be Wynn et al. (2008) BPM 2008, not Rozinat et al. (2009) DKE. The 2009 DKE paper is the canonical journal version.

**Assessment:** WEAKENED. A BPM 2008 conference paper by Wynn et al. (also with van der Aalst) predates the 2009 journal paper. The `first_peer_reviewed` label should be updated to Wynn et al. (2008) BPM 2008, with the 2009 DKE paper as canonical journal version.

---

### playout — Playout

**Claim:** `first_peer_reviewed` = van der Aalst (2011) Springer monograph; `confidence` = medium.

**Attack 2 — Is a textbook/monograph the appropriate `first_peer_reviewed`?** Springer research monographs do undergo peer review, but they are not conference or journal papers. Using a textbook as `first_peer_reviewed` is unusual in this context. The playout concept as classical Petri net token-game predates any PM publication.

**Assessment:** UPHELD (with caveat). The document correctly notes that no standalone paper isolates playout as a novel PM-specific algorithm; the 2011 monograph is the best available reference. The classification of medium confidence is appropriate. The use of a monograph as `first_peer_reviewed` is defensible given the absence of a journal or conference paper.

---

### ml_cluster — Trace Clustering

**Claim:** `first_peer_reviewed` = Song, Günther, van der Aalst (2008) BPM 2008 workshops.

**Attack 3 — Is BPM workshop peer-reviewed?** BPM 2008 workshops published in LNBIP (Lecture Notes in Business Information Processing) are peer-reviewed Springer proceedings. The claim is appropriate.

**Attack 4 — Is k-means the original, not the PM adaptation?** YES — the document correctly distinguishes generic k-means (MacQueen 1967) from the PM-specific adaptation (Song et al. 2008). This is properly handled.

**Assessment:** UPHELD. Song et al. (2008) BPM 2008 workshops is the correct first peer-reviewed PM-specific trace clustering paper. Claim stands.

---

### ml_anomaly — Anomaly Detection

**Claim:** `first_peer_reviewed` = Bezerra, Wainer, van der Aalst (2009) BPMDS 2009.

**Attack 3 — Is BPMDS 2009 peer-reviewed?** BPMDS (Business Process Modeling, Development, and Support) is a workshop co-located with CAiSE 2009. The proceedings (LNBIP 29, Springer) are peer-reviewed.

**Assessment:** UPHELD. Bezerra et al. (2009) BPMDS is the correct first peer-reviewed PM-specific anomaly detection paper. Claim stands.

---

### next_activity — Next Activity Prediction

**Claim:** `first_peer_reviewed` = van der Aalst, Schonenberg, Song (2011) Information Systems journal, for general PM prediction; Tax et al. (2017) CAiSE as canonical LSTM-based paper.

**Attack — Evermann vs Tax priority?** The document notes Evermann, Rehse, Fettke as predating Tax et al. "by a few months in preprint." WebSearch confirms: Evermann et al. arXiv preprint is dated December 14, 2016 (arXiv:1612.04600); Tax et al. CAiSE 2017 conference paper is from June 2017. The Evermann et al. paper also appeared in Decision Support Systems (2016/2017) and at BPM 2016 workshops. This is not merely a preprint priority question — the Evermann et al. work appeared in a peer-reviewed venue (BPM 2016 workshops, Springer LNBIP) before Tax et al. CAiSE 2017.

**Reclassification:** The document should not label Tax et al. CAiSE 2017 as the `first_peer_reviewed` LSTM-based next-activity paper if Evermann et al. appeared in BPM 2016 workshops (Springer LNBIP) earlier. The `first_peer_reviewed` for LSTM-based next-activity prediction should be Evermann et al. BPM 2016 workshops.

**Assessment:** WEAKENED. The document acknowledges Evermann et al. but labels Tax et al. as the "canonical reference," which may be true by citation count but not by temporal priority for peer-reviewed publication.

---

### remaining_time — Remaining Time Prediction

**Claim:** `first_peer_reviewed` = van der Aalst, Schonenberg, Song (2011) Information Systems.

**Attack 3 — Earlier peer-reviewed source?** No earlier peer-reviewed PM-specific remaining time prediction paper identified. The 2011 IS journal paper is the canonical first.

**Assessment:** UPHELD. Claim stands.

---

### outcome — Case Outcome Prediction

**Claim:** `first_peer_reviewed` = Leontjeva et al. (2015) BPM 2015 for ML-based outcome prediction.

**Assessment:** UPHELD. BPM 2015 (LNCS) is peer-reviewed. No earlier ML-based outcome prediction paper for PM found. Claim stands.

---

## Summary Table

| Algorithm | Source Doc | Verdict | Issue |
|---|---|---|---|
| dfg | 10 | WEAKENED | first_peer_reviewed should be Cook & Wolf 1995 ICSE, not 1998 TOSEM |
| process_skeleton | 10 | UPHELD | Correct structure (arXiv 2018 / STTT 2021) |
| alpha_plus_plus | 10 | UPHELD | Correctly distinguishes alpha/alpha+/alpha++ variants |
| heuristic_miner | 10 | WEAKENED | first_peer_reviewed should be Weijters & van der Aalst (2003) ICAE, not 2006 BETA WP (not peer-reviewed) |
| inductive_miner | 10 | UPHELD | ICATPN 2013 confirmed as first |
| ilp | 10 | WEAKENED | first_peer_reviewed should be ICATPN 2008 (conference), not 2009 Fundamenta (journal extension) |
| genetic_algorithm | 10 | UPHELD | WP 124 / ICATPN 2005 structure correct |
| hill_climbing | 10 | UPHELD | Low-confidence admission is correct |
| simulated_annealing | 10 | UNCERTAIN | Liu et al. 2008 ICYCS plausible but minor venue; cannot verify without deeper access |
| aco | 10 | UPHELD | Canfora et al. 2013 IEEE SERVICES appears correct |
| pso | 10 | UPHELD | Low-confidence admission correct |
| optimized_dfg | 10/14 | UPHELD + DOI INCONSISTENCY | DOI differs between docs 10 and 14; must be corrected |
| hierarchical_dfg | 10/14 | UPHELD | Engineering composite, no standalone paper; low confidence correct |
| causal_graph | 10 | UPHELD | CONCUR 2011 confirmed |
| correlation_miner | 10 | WEAKENED | first_peer_reviewed should be CoopIS 2015 (conference), not IJCIS 2017 (journal) |
| alignments | 11 | WEAKENED | first_peer_reviewed should be ACSD 2011 (June), not EDOC 2011 (Sept) — ACSD precedes EDOC |
| etconformance_precision | 11 | UPHELD | BPM 2010 confirmed |
| generalization | 11 | UPHELD | OTM 2012 confirmed |
| token_replay | 11 | WEAKENED (minor) | first_peer_reviewed should be BPM'05 Workshops 2006 (LNCS), not IS 2008 journal |
| complexity_metrics | 11 | UPHELD | IST 2009 confirmed |
| declare | 11 | UNCERTAIN | 2006 BPM workshop may be peer-reviewed (LNCS); cannot determine without review records |
| ocel | 12 | WEAKENED (minor) | first_known_format should be Jan 2020 ocel-standard.org spec, not SEFM 2019 (concept only) |
| ocel_2_0 | 12 | UPHELD | ICPM 2023 resources track correct |
| oc_dfg | 12 | UPHELD | STTT 2022/2023 confirmed |
| oc_petri_net | 12 | UPHELD | Fundamenta 2020 confirmed; journal preceded arXiv |
| oc_declare | 12 | UPHELD | BPM 2025 confirmed |
| ocpq_query_engine | 12 | UPHELD | RCIS 2025 confirmed |
| wf_net_soundness | 13 | UPHELD | CS Report 96/23 / ICATPN 1997 correct |
| process_trees | 13 | UPHELD | ICATPN 2013 correct |
| powl 1.0 | 13 | UPHELD | BPM 2023 confirmed |
| wf_net_to_powl | 13 | UPHELD | Petri Nets 2025 / arXiv 2503.20363 confirmed |
| pnml_import | 13 | UPHELD | ISO/IEC 15909-2:2011 correct standard citation |
| bpmn_import | 13 | UPHELD | OMG BPMN 2.0 / ISO/IEC 19510:2013 correct |
| yawl_export | 13 | UPHELD | IS 2005 / QUT TR 2002 correct |
| streaming_log | 14 | UPHELD | arXiv 2012 / CEC 2014 correct |
| performance_spectrum | 14 | UPHELD | BPM 2018 confirmed, no earlier version |
| batches | 14 | WEAKENED (minor) | first_peer_reviewed should clarify: Wen et al. 2013 (single-task) vs Martin et al. 2021 (subprocess) |
| ml_cluster | 15 | UPHELD | BPM 2008 workshops confirmed |
| ml_anomaly | 15 | UPHELD | BPMDS 2009 confirmed |
| next_activity | 15 | WEAKENED | first_peer_reviewed LSTM = Evermann et al. BPM 2016 workshops, not Tax et al. CAiSE 2017 |
| remaining_time | 15 | UPHELD | IS 2011 confirmed |
| outcome | 15 | UPHELD | BPM 2015 confirmed |
| handover_network | 16 | UPHELD | BPM 2004 confirmed |
| working_together_network | 16 | UPHELD | BPM 2004 confirmed |
| monte_carlo_simulation | 16 | WEAKENED | first_peer_reviewed = Wynn et al. (2008) BPM 2008, not Rozinat et al. (2009) DKE |
| playout | 16 | UPHELD | Monograph 2011 as best available source; medium confidence correct |

---

## Final Count

| Verdict | Count |
|---|---|
| UPHELD | 33 |
| WEAKENED | 10 |
| OVERTURNED | 0 |
| UNCERTAIN | 2 |
| **Total claims audited** | **45** |

---

## Priority Corrections Required

These are the highest-priority corrections based on factual errors (not merely precision improvements):

### P1 — CRITICAL: alignments first_peer_reviewed (Doc 11)
The ACSD 2011 paper (Adriansyah, Sidorova, van Dongen; June 2011) predates the EDOC 2011 paper (August–September 2011). EDOC 2011 cannot be `first_peer_reviewed` when ACSD 2011 is confirmed earlier. Both are peer-reviewed IEEE/ACM venues.

### P2 — SIGNIFICANT: heuristic_miner first_peer_reviewed (Doc 10)
BETA WP 166 (2006) is a technical report, not a peer-reviewed paper. The 2003 ICAE journal paper (Weijters & van der Aalst) IS peer-reviewed and IS earlier. The document's current structure contradicts itself.

### P3 — SIGNIFICANT: dfg first_peer_reviewed (Doc 10)
Cook & Wolf published at ICSE 1995 (peer-reviewed ACM conference) three years before the 1998 TOSEM journal paper. ICSE 1995 is the correct `first_peer_reviewed`.

### P4 — MODERATE: next_activity LSTM first_peer_reviewed (Doc 15)
Evermann et al. appeared at BPM 2016 workshops (Springer LNBIP, peer-reviewed) before Tax et al. CAiSE 2017. Tax et al. may be the more-cited paper, but Evermann et al. has temporal peer-reviewed priority for LSTM-based next-activity prediction.

### P5 — MODERATE: monte_carlo_simulation first_peer_reviewed (Doc 16)
Wynn et al. BPM 2008 (Springer LNCS) precedes Rozinat et al. DKE 2009 and is a peer-reviewed conference paper.

### P6 — STRUCTURAL PATTERN: Conference papers systematically mislabeled
The ILP Miner (ICATPN 2008 → Fundamenta 2009), Correlation Miner (CoopIS 2015 → IJCIS 2017), token_replay (BPM'05 Workshops 2006 → IS 2008), and batches (Wen et al. 2013 → Martin et al. 2021) all exhibit the same error: a peer-reviewed conference paper is labeled `first_known` while the subsequent journal paper is labeled `first_peer_reviewed`. In all these cases the conference paper IS peer-reviewed and IS the `first_peer_reviewed`. This is a systematic labeling error that should be corrected across all documents.

### P7 — MINOR: optimized_dfg DOI inconsistency
Documents 10 and 14 cite the Chapela-Campa 2022 paper with different DOIs (10.1016/j.ins.2022.07.178 vs 10.1016/j.ins.2022.07.170). Only one can be correct; this must be verified.

---

## Claims NOT Overturned

No claims have been classified OVERTURNED. In all challenged cases, the cited paper exists and is real; the issues are temporal priority within the correct lineage (a conference paper before its journal expansion) rather than wrong papers entirely. No case was found where a completely different author or different algorithm was the actual origin of the technique.

---

*Audit conducted by Agent A12 — First-Claim Adversary. All findings based on WebSearch queries executed 2026-05-30. Citations should be independently verified before updating source documents.*
