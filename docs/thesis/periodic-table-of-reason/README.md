# The Periodic Table of Reason

**Operational Falsifiability, Epistemological Geometry, and the Breed Validation Certificate for Manufactured Intelligence**

Autonomic Research Division — wasm4pm Ecosystem
June 2026

---

## Series Context

This document is **fourth** in the wasm4pm theoretical series:

| # | Title |
|---|-------|
| I | *Topological Annihilation of the Undecidable* |
| II | *Semantic Physics and the Proof-Bound Universe* |
| III | *Proof-Bound Causation and the Receipt Monad* |
| **IV** | **The Periodic Table of Reason** *(this work)* |

---

## Abstract Summary

This thesis establishes a periodic classification of AI reasoning breeds — analogous to Mendeleev's table — grounded in operational falsifiability rather than architectural description. Each breed occupies a unique position in epistemological geometry, characterized by its input contract, output contract, and the receipt it must emit to prove lawful execution. The Breed Validation Certificate formalizes this geometry into a machine-checkable proof gate, making manufactured intelligence auditable at the level of individual reasoning acts.

---

## Compile Instructions

Requires a standard TeX distribution (TeX Live 2023+ or MiKTeX):

```bash
# Single build (may have missing references on first pass)
make

# Full clean rebuild
make clean && make

# Manual two-pass
pdflatex -interaction=nonstopmode main.tex
pdflatex -interaction=nonstopmode main.tex
```

Chapter stubs must exist in `chapters/` before compilation. Create them with:

```bash
for i in 00 01 02 03 04 05 06 07 08 09 10 11 12 13; do
  touch chapters/${i}-*.tex 2>/dev/null || true
done
```

Output: `main.pdf`
