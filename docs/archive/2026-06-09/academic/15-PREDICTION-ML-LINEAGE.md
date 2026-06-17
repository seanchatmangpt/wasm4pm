# Prediction and ML Algorithms — Historical Lineage

*Generated 2026-05-30 — static knowledge base, no network calls.*

Source hierarchy: peer-reviewed conf/journal > standard > PhD thesis > book > arXiv preprint.

Coverage kinds: `direct` | `derived` | `engineering` | `consumer-contract` | `future`

---

## `ml_cluster`

**Formal object:** K-means clustering of process traces on feature vectors
**coverage_kind:** `engineering`
**confidence:** `engineering_only`
**first_known:** `macqueen_1967`

**Notes:**
- k-means origin: MacQueen 1967. No PM-specific clustering paper mapped to this implementation.
- PM trace clustering exists (Song et al.) but this implementation is generic k-means.

---

## `ml_anomaly`

**Formal object:** Information-theoretic anomaly scoring on process traces (log2 edge-frequency; missing-edge cost=10)
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering primitive: custom scoring formula. No canonical PM anomaly paper mapped.
- PM anomaly detection exists (Nolle et al., LSTM-based) but not this implementation.

---

## `predict_next_activity`

**Formal object:** Next activity prediction from partial trace prefix using n-gram or ML model
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `van_dongen_et_al_2008`
**first_peer_reviewed:** `van_dongen_et_al_2008`
**canonical:** `tax_et_al_2017_lstm`

**Notes:**
- Earliest: van Dongen et al. 2008 (suffix prediction).
- Canonical ML-based: Tax et al. 2017 — LSTM for next-activity and remaining time.
- Many approaches exist; this implementation likely uses n-gram prefix model.

---

## `predict_remaining_time`

**Formal object:** Remaining time prediction from partial trace using regression or survival analysis
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `van_dongen_et_al_2008`
**first_peer_reviewed:** `van_dongen_et_al_2008`
**canonical:** `tax_et_al_2017_lstm`

**Notes:**
- van Dongen et al. 2008: earliest predictive PM paper.
- Tax et al. 2017: LSTM for next activity and remaining time (canonical ML approach).
- Weibull regression variant: Rogge-Solti & Weske 2013.

---

## `compute_ewma`

**Formal object:** Exponentially Weighted Moving Average for process monitoring signal smoothing
**coverage_kind:** `engineering`
**confidence:** `engineering_only`
**first_known:** `roberts_1959_ewma`

**Notes:**
- EWMA: Roberts 1959 (Technometrics). General statistical method.
- Applied to process monitoring as part of SPC/control chart family.
- No PM-specific EWMA paper mapped to this implementation.

---

## `detect_drift`

**Formal object:** Concept drift detection in process event streams (change in process behavior over time)
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `bose_et_al_2011`
**first_peer_reviewed:** `bose_et_al_2011`
**canonical:** `bose_et_al_2011`

**Notes:**
- Bose, van der Aalst, Zliobaite, Pechenizkiy — BPM 2011: 'Handling Concept Drift in Process Mining'.
- Earlier statistical drift detection (CUSUM, ADWIN) predates PM application.

---

