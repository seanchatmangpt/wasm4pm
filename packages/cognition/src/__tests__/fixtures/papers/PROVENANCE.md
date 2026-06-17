# Breed Paper Provenance Manifest — wasm4pm cognition layer

Single audit surface: which test data came from which paper.

| Breed | Paper Path | Citation | Extraction Type | Fixture Files |
|---|---|---|---|---|
| `eliza` | `~/Documents/Papers/AI_LLM/Weizenbaum-1966-ELIZA-CACM.pdf` | Weizenbaum J (1966) ELIZA — A Computer Program for the Study of Natural Language Communication Between Man and Machine. *CACM* 9(1):36–45 | PDF present — full extraction | `breed-inputs.ts` (eliza entry), `breed-inputs-real.ts` (eliza entry) |
| `cbr` | `~/Documents/Papers/AI_LLM/Aamodt-Plaza-1994-CBR-AIC.pdf` | Aamodt A, Plaza E (1994) Case-Based Reasoning: Foundational Issues, Methodological Variations, and System Approaches. *AI Communications* 7(1):39–59 | PDF present — full extraction | `breed-inputs.ts` (cbr entry), `breed-inputs-real.ts` (cbr entry) |
| `dendral` | `~/Documents/Papers/AI_LLM/Feigenbaum-Buchanan-Lederberg-1971-DENDRAL.pdf` | Feigenbaum EA, Buchanan BG, Lederberg J (1971) On Generality and Problem Solving: A Case Study Using the DENDRAL Program. *Machine Intelligence* 6:165–190 | PDF present — full extraction | `breed-inputs.ts` (dendral entry), `breed-inputs-real.ts` (dendral entry) |
| `strips` | `~/Documents/Papers/AI_LLM/Fikes-Nilsson-1971-STRIPS-AIJ.pdf` | Fikes RE, Nilsson NJ (1971) STRIPS: A New Approach to the Application of Theorem Proving to Problem Solving. *Artificial Intelligence* 2(3–4):189–208 | PDF present — full extraction | `breed-inputs.ts` (strips entry), `breed-inputs-real.ts` (strips entry) |
| `prolog` | `~/Documents/Papers/AI_LLM/Kowalski-1974-Predicate-Logic-Programming-IFIP.pdf` | Kowalski R (1974) Predicate Logic as a Programming Language. *Proc. IFIP Congress* 74:569–574. Negative oracle: Robinson JA (1965) A Machine-Oriented Logic Based on the Resolution Principle. *JACM* 12(1):23–41 (`Robinson-1965-Resolution-Principle-JACM.pdf`) | PDF present (both) — full extraction | `breed-inputs.ts` (prolog entry), `breed-inputs-real.ts` (prolog entry) |
| `mycin` | `~/Documents/Papers/AI_LLM/Shortliffe-Buchanan-1975-CF-Model.pdf` | Shortliffe EH, Buchanan BG (1975) A Model of Inexact Reasoning in Medicine. *Mathematical Biosciences* 23(3–4):351–379 | PDF present — full extraction | `breed-inputs.ts` (mycin entry), `breed-inputs-real.ts` (mycin entry) |
| `gps` | `~/Documents/Papers/AI_LLM/Newell-Simon-1963-GPS-RAND.pdf` | Newell A, Simon HA (1963) GPS, A Program That Simulates Human Thought. *RAND Memorandum P-2257* | PDF present — full extraction | `breed-inputs.ts` (gps entry), `breed-inputs-real.ts` (gps entry) |
| `soar` | `~/Documents/Papers/AI_LLM/Laird-Newell-Rosenbloom-1987-SOAR-AIJ.pdf` | Laird JE, Newell A, Rosenbloom PS (1987) SOAR: An Architecture for General Intelligence. *Artificial Intelligence* 33(1):1–64 | PDF present — full extraction | `breed-inputs.ts` (soar entry), `breed-inputs-real.ts` (soar entry) |
| `hearsay` | `~/Documents/Papers/AI_LLM/Erman-et-al-1980-Hearsay-II-CSUR.pdf` | Erman LD, Hayes-Roth F, Lesser VR, Reddy DR (1980) The Hearsay-II Speech-Understanding System: Integrating Knowledge to Resolve Uncertainty. *ACM Computing Surveys* 12(2):213–253 | PDF present — full extraction | `breed-inputs.ts` (hearsay entry), `breed-inputs-real.ts` (hearsay entry) |
| `autoinstinct_learning` | `~/Documents/Papers/AI_LLM/Sussman-1973-HACKER-MIT-AITR-297.pdf` | Sussman GJ (1973) A Computational Model of Skill Acquisition. *MIT AI Technical Report 297* | PDF present — full extraction | `breed-inputs.ts` (autoinstinct_learning entry), `breed-inputs-real.ts` (autoinstinct_learning entry) |
| `autoinstinct_semantics` | citation-only | Schank RC (1972) Conceptual Dependency: A Theory of Natural Language Understanding. *Cognitive Psychology* 3(4):552–631 | citation-only — `Schank-1972-ConceptualDependency.pdf` not present on disk | `breed-inputs.ts` (autoinstinct_semantics entry), `breed-inputs-real.ts` (autoinstinct_semantics entry) |
| `autoinstinct_neurosis` | citation-only | Boden MA (1977) *Artificial Intelligence and Natural Man*. Basic Books, New York. (book — no PDF expected) | citation-only — book source, no PDF | `breed-inputs.ts` (autoinstinct_neurosis entry), `breed-inputs-real.ts` (autoinstinct_neurosis entry) |
| `autoinstinct_vision` | `~/Documents/Papers/AI_LLM/Marr-Poggio-1976-StereoDisparity.pdf` | Marr D, Poggio T (1976) Cooperative Computation of Stereo Disparity. *Science* 194(4262):283–287 | PDF present — full extraction | `breed-inputs.ts` (autoinstinct_vision entry), `breed-inputs-real.ts` (autoinstinct_vision entry) |

## PDF Presence Audit (verified 2026-06-10)

| PDF | Present |
|---|---|
| `Weizenbaum-1966-ELIZA-CACM.pdf` | yes |
| `Aamodt-Plaza-1994-CBR-AIC.pdf` | yes |
| `Feigenbaum-Buchanan-Lederberg-1971-DENDRAL.pdf` | yes |
| `Fikes-Nilsson-1971-STRIPS-AIJ.pdf` | yes |
| `Kowalski-1974-Predicate-Logic-Programming-IFIP.pdf` | yes |
| `Robinson-1965-Resolution-Principle-JACM.pdf` (prolog negative oracle) | yes |
| `Shortliffe-Buchanan-1975-CF-Model.pdf` | yes |
| `Newell-Simon-1963-GPS-RAND.pdf` | yes |
| `Laird-Newell-Rosenbloom-1987-SOAR-AIJ.pdf` | yes |
| `Erman-et-al-1980-Hearsay-II-CSUR.pdf` | yes |
| `Sussman-1973-HACKER-MIT-AITR-297.pdf` | yes |
| `Schank-1972-ConceptualDependency.pdf` | **no** — citation-only |
| `Marr-Poggio-1976-StereoDisparity.pdf` | yes |

---

Law: every breed fixture must trace to a paper. citation-only status is permitted but must be documented.
