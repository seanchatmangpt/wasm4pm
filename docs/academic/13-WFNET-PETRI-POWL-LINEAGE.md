# WF-net / Petri net / POWL — Historical Lineage

*Generated 2026-05-30 — static knowledge base, no network calls.*

Source hierarchy: peer-reviewed conf/journal > standard > PhD thesis > book > arXiv preprint.

Coverage kinds: `direct` | `derived` | `engineering` | `consumer-contract` | `future`

---

## `powl_to_process_tree`

**Formal object:** Language-preserving WF-net → POWL translation (Algorithm 3, Theorem 1: language preservation)
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `kourani_park_van_der_aalst_2026`
**first_peer_reviewed:** `kourani_park_van_der_aalst_2026`
**canonical:** `kourani_park_van_der_aalst_2026`

**Notes:**
- arXiv:2602.15739v3 — Kourani, Park, van der Aalst.
- Formally maps: Def 3.1–3.13 (WF-net predicates), Algorithm 3 (translation), Theorem 1 (language preservation).
- Currently arXiv preprint; peer-reviewed venue not yet confirmed.

---

## `pnml_import`

**Formal object:** Petri Net Markup Language (PNML) import: ISO/IEC 20481 compliant XML parsing
**coverage_kind:** `consumer-contract`
**confidence:** `high`
**first_known:** `iso_pnml_2019`
**first_peer_reviewed:** `iso_pnml_2019`
**canonical:** `iso_pnml_2019`

**Notes:**
- ISO/IEC 20481:2019 — Petri nets transfer format.
- This is a standard, not an algorithm. Classify: standard_only / consumer-contract.

---

## `bpmn_import`

**Formal object:** Business Process Model and Notation (BPMN 2.0) import: OMG standard parsing
**coverage_kind:** `consumer-contract`
**confidence:** `high`
**first_known:** `omg_bpmn_2011`
**first_peer_reviewed:** `omg_bpmn_2011`
**canonical:** `omg_bpmn_2011`

**Notes:**
- OMG BPMN 2.0 specification (2011). A standard, not an algorithm.
- BPMN to Petri net mapping: van der Aalst et al. have papers on this conversion.

---

## `yawl_export`

**Formal object:** Yet Another Workflow Language (YAWL) export: workflow net serialization
**coverage_kind:** `consumer-contract`
**confidence:** `high`
**first_known:** `van_der_aalst_hofstede_2005_yawl`
**first_peer_reviewed:** `van_der_aalst_hofstede_2005_yawl`
**canonical:** `van_der_aalst_hofstede_2005_yawl`

**Notes:**
- van der Aalst & ter Hofstede, Information Systems 2005.
- YAWL is a language specification; this is format export, not a discovery algorithm.

---

## `transition_system`

**Formal object:** Transition system as process model: states from log abstractions, transitions from observed moves
**coverage_kind:** `direct`
**confidence:** `medium`
**first_known:** `van_der_aalst_et_al_ts_2010`
**first_peer_reviewed:** `van_der_aalst_et_al_ts_2010`
**canonical:** `van_der_aalst_et_al_ts_2010`

**Notes:**
- van der Aalst, Rubin, Günther, Verbeek, Rozinat, Kindler — ICATPN 2010.
- State-based representation: log abstractions as states, directly-follows as transitions.

---

## `declare`

**Formal object:** DECLARE: declarative process specification via LTL-based constraints over activities
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `pesic_van_der_aalst_2006`
**first_peer_reviewed:** `pesic_van_der_aalst_2006`
**canonical:** `pesic_van_der_aalst_2006`, `pesic_2008_phd`

**Notes:**
- Pesic & van der Aalst, BPM 2006 workshop: 'A Declarative Approach for Flexible Business Processes Management'.
- PhD thesis: Pesic 2008 (TU/e): full DECLARE system with constraint families.

---

