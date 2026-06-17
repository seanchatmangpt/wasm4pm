# OLDIA Thesis — arXiv Submission Notes

**OLDIA: Operational Lifecycle Determinism in Intelligent Architectures**
Validated, Falsified, and Deployed at Civilization Scale

Author: Sean Chatman, wasm4pm Research Group
Date: June 2026

---

## How to Compile

```
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

Or use the provided Makefile:

```
make
```

Requires a full TeX Live or MiKTeX installation with the following packages:
`amsmath`, `amssymb`, `amsthm`, `listings`, `booktabs`, `longtable`, `hyperref`,
`xcolor`, `geometry`, `fancyhdr`, `natbib`, `graphicx`, `algorithm2e`.

---

## Chapter Structure

| File | Chapter |
|---|---|
| `acknowledgments.tex` | Acknowledgments |
| `00-abstract.tex` | Title page and Abstract |
| `01-introduction.tex` | Chapter 1 — Introduction |
| `02-background.tex` | Chapter 2 — Background |
| `03-framework.tex` | Chapter 3 — OLDIA Framework |
| `04-falsification.tex` | Chapter 4 — Falsification Methodology |
| `05-fortune5.tex` | Chapter 5 — Fortune-5 Deployment |
| `06-inventors.tex` | Chapter 6 — Inventors and Prior Art |
| `07-conclusion.tex` | Chapter 7 — Conclusion |
| `A-appendix.tex` | Appendix A — Test Inventory |
| `references.bib` | Bibliography |

---

## Test Evidence

All claims in this thesis are grounded by **655 verified tests** with zero failures:

- **480 Rust tests** — adversarial bypass attempts, mathematical property invariants,
  formal SOAR/STRIPS/CBR invariants, 13-breed bit-exact determinism harnesses,
  OCEL lifecycle conformance, and more.
- **175 TypeScript tests** — integration harnesses, cognition contract validation,
  BLAKE3 receipt chain verification, and end-to-end breed execution.

The test suite enforces unfakeable oracles: Prolog's grandparent derivation requires
genuine Robinson unification; SOAR's preference algebra requires correct impasse
resolution; STRIPS plan soundness is checked against pre/post-condition semantics.

---

## Implementation

The complete implementation is available at:
https://github.com/chatmangpt/wasm4pm

The cognition layer lives in `crates/wasm4pm-cognition/` (Rust/WASM) and
`packages/cognition/` (TypeScript wrapper). The OCEL provability layer is wired at
`run_breed` in `crates/wasm4pm-cognition/src/wasm.rs`.
