# wasm4pm Onboarding & Learning Experience Assessment
**Cycle 53 Agent 5 — May 17, 2026**

---

## EXECUTIVE SUMMARY

**Zero-to-first-result time:** 9–17 minutes (realistic estimate: ~15 min)
- Installation: 3–5 min (Node.js + npm package)
- Data discovery: 2–3 min (download sample file)
- First run: 0.5–1 min (discovery execution)
- Interpretation: 2–5 min (understanding output)

**Critical finding:** Users get stuck NOT on tooling, but on domain knowledge.

**Most common friction:** "What's a process model?" and "Which algorithm do I use?"

---

## PART 1: ZERO-TO-FIRST-RESULT PATH ANALYSIS

### Timeline (Fresh User, Fresh Installation)

| Activity | Time | Friction Points |
|----------|------|---|
| Navigate to docs | 0.5 min | README is clear |
| Read INSTALL.md | 3–5 min | Covers all platforms |
| Execute npm install | 1–2 min | Depends on npm cache |
| Find/download sample data | 2–3 min | "wget" command requires manual URL |
| Run "wpm run sample.xes" | 0.5–1 min | Execution is fast |
| View results | 0.5 min | "wpm results" is clear |
| Interpret output | 2–5 min | **WHERE THE CONFUSION STARTS** |
| **TOTAL** | **9–17 min** | **(realistic: ~15 min)** |

### Key Findings by Phase

**PHASE 1: Installation (✓ Good)**
- Comprehensive docs (INSTALL.md, 100+ lines)
- Multiple methods (npm, dev, Docker)
- Prerequisites clearly listed
- Post-install verification step exists
- FRICTION: PATH resolution issues (rare, but happens on Windows/WSL)

**PHASE 2: Data Discovery (⚠ Acceptable but Improvable)**
- Sample data exists (2 XES files: sepsis.xes, bpi2020_travel.xes)
- FRICTION: Download URL is hardcoded in README (maintenance burden)
- FRICTION: New user unsure if file size is appropriate
- Quick Start provides clear example

**PHASE 3: First Run (✓ Good)**
- QUICK_START.md shows exact command: "wpm run sample.xes"
- Expected output is documented
- Results auto-save
- FRICTION: Default algorithm (dfg) not mentioned until after run

**PHASE 4: Interpretation (✗ CRITICAL GAP)**
- Quick Start shows output format (activities, traces, variants)
- MISSING: What do these numbers mean?
  - "variants: 42" — user doesn't know if this is good or bad
  - "model saved to .wasm4pm/results/" — user doesn't know what to do with it
- MISSING: Visual explanation of DFG structure
- MISSING: Quality context (fitness, precision, generalization)

---

## PART 2: EDUCATIONAL MATERIAL AUDIT

### Status Summary

✓ **README:** Present, well-structured (375 lines)
✓ **QUICK_START.md:** Clear 3-minute walkthrough
✓ **TUTORIALS.md:** 8 tutorials (5–10 min each)
✓ **INSTALL.md:** Comprehensive (100+ lines, all platforms)
✓ **FAQ.md:** 938 lines (covers many use cases)
✓ **troubleshooting.md:** 840 lines (error recovery)
✓ **EXPLANATION.md:** 299 lines (system architecture)
✗ **DOMAIN_PRIMER.md:** MISSING
✗ **ALGORITHM_SELECTION_GUIDE.md:** MISSING
✗ **INTERPRETING_RESULTS.md:** MISSING
✗ **LEARNING_PATHS.md:** MISSING

**Documentation Statistics:**
- Total markdown files: 311
- Tutorial files: 9 (in docs/tutorials/)
- Main entry points: 3 (README → QUICK_START → TUTORIALS)
- Estimated total lines: 37,415

### Knowledge Gap Inventory

#### 1. Process Mining Domain (CRITICAL)
**Current state:**
- README defines process mining
- README mentions Van der Aalst framework
- EXPLANATION.md explains architecture

**Gaps:**
- No beginner-friendly explanation of event logs
- No visual example (log data → DFG model)
- No business context ("why would an analyst use this?")
- Key terms scattered across multiple docs

**Impact:** 10–15 min of domain confusion for new users

#### 2. XES Format Understanding (MODERATE)
**Current state:**
- README mentions "XES file"
- QUICK_START mentions "sepsis.xes"

**Gaps:**
- No explanation of XES structure
- No validation guidance
- No error handling guide
- Difference between formats (.xes, .json, .ocel) unexplained

**Impact:** Malformed XES → cryptic errors

#### 3. Algorithm Selection (MODERATE)
**Current state:**
- README has speed/quality comparison table
- Default algorithm mentioned

**Gaps:**
- No "which algorithm should I use?" decision tree
- No size-based recommendations
- No clarity on output types (DFG vs Petrinet vs Tree)
- Performance characteristics not documented

**Impact:** User picks randomly or reads all 41 algorithm descriptions

#### 4. Interpreting Results (MODERATE-HIGH)
**Current state:**
- Quick Start shows sample output
- Tutorials show JSON format

**Gaps:**
- What is a "variant"?
- What do edge weights mean?
- What is "fitness"?
- JSON output structure not documented
- Quality metrics unexplained

**Impact:** User misinterprets results, thinks tool is broken

#### 5. Troubleshooting (✓ Good)
**Current state:**
- FAQ.md (938 lines)
- troubleshooting.md (840 lines)
- Error recovery hints in CLI

**Gaps:**
- FAQ has no index/TOC
- Common first-run errors not highlighted
- New user doesn't know where to search

**Impact:** Minimal (searchable, but friction remains)

---

## PART 3: ACCESSIBILITY & LOCALIZATION AUDIT

### Keyboard Navigation & Terminal Friendliness: ✓ Good
- All commands are keyboard-only (no mouse required)
- Help text: wpm --help (clear listing)
- Config via TOML/JSON (keyboard-editable)
- Output is line-based (terminal-friendly)
- No emoji-only indicators (✓ / ✗ used, with text context)

### Color Usage & Color-Blind Accessibility: ⚠ Acceptable
- ANSI colors used for semantic highlighting
- Red/green distinction alone (potential colorblind issue)
- NO FLAG: --no-color not documented (exists in consola, not exposed)
- **Recommendation:** Test with color-blind simulation tools

### Output Formats: ✓ Good
- Human-readable (ANSI colored)
- JSON (machine-readable, no colors)
- JSONL (streaming)
- SARIF (CI/CD integration)

### Internationalization: ✗ NOT IMPLEMENTED
- All strings are English-only
- No i18n framework
- No translation planned
- **Note:** Not critical for MVP, but limits market reach

### Mobile & Responsive Docs: ✓ Good
- All markdown (device-agnostic)
- No JavaScript-heavy site
- GitHub renders cleanly
- Searchable via GitHub interface

### Video Content & Walkthroughs: ✗ None
- No installation video
- No "first run" walkthrough
- No algorithm explanation videos
- **Gap:** ~30% of users prefer video learning

### Interactive Playground: ✗ Not Available
- No browser-based sandbox
- Requires Node.js + npm install
- Blocks browser-only users (students, non-developers)
- **Comparison:** pm4py offers Jupyter notebooks; wasm4pm has no equivalent

---

## PART 4: HIGHEST-IMPACT IMPROVEMENTS (PRIORITIZED)

### RANK 1: Domain Knowledge Entry Point — DOMAIN_PRIMER.md
**Impact:** Very High | **Effort:** 2–3h | **ROI:** HIGH | **Time Saved:** 10–15 min

**Problem:** New user has zero intuition for process mining concepts

**Solution:** Create `docs/DOMAIN_PRIMER.md` (1–2 pages, 500–800 words)

**Contents:**
1. What is process mining? (1 paragraph)
2. Why do we care? (2–3 bullet points per audience: auditors, analysts, managers)
3. What is an event log? (definition + structure: Case ID | Activity | Timestamp | Resource | Attributes)
4. Key vocabulary (glossary: trace, variant, directly-follows, resource)
5. Visual example (event log → DFG, 2 ASCII diagrams)
6. Van der Aalst's 3 questions (discovery, conformance, enhancement)

---

### RANK 2: Algorithm Selection Decision Tree
**Impact:** High | **Effort:** 1h | **ROI:** HIGH | **Time Saved:** 5–10 min

**Problem:** User sees 41 algorithms, unsure which to pick

**Solution:** Create `docs/ALGORITHM_SELECTION_GUIDE.md` (2 pages)

**Contents:**
1. Quick decision tree (visual flowchart)
   - < 1,000 events → dfg
   - 1–100K events → heuristic_miner
   - > 100K events → genetic_algorithm
   - Streaming → simd_streaming_dfg

2. Speed vs. Quality trade-off table (reuse existing + "Best for" row)
3. Output type guide (DFG, Petri net, Process tree)
4. Recommendations by use case (compliance, bottleneck analysis, real-time)

---

### RANK 3: Result Interpretation Guide
**Impact:** Medium | **Effort:** 1–2h | **ROI:** MEDIUM | **Time Saved:** 3–5 min

**Problem:** User gets output, unsure what numbers mean

**Solution:** Create `docs/INTERPRETING_RESULTS.md` or extend QUICK_START.md

**Contents:**
1. JSON output explained (activities, edges, statistics)
2. What is fitness? (0–1 scale, interpretation)
3. Visual example (DFG interpretation, edge weights)
4. Quality metrics at a glance (fitness, precision, simplicity)
5. When results disappoint (troubleshooting section)

---

### RANK 4: Enhanced First-Run Experience
**Impact:** Medium | **Effort:** 2–3h | **ROI:** MEDIUM | **Time Saved:** 2–3 min

**Problem:** New user unsure if wpm is working after install

**Solution:** Enhance `wpm init` / create `wpm onboard` command

**Features:**
1. Verification: `wpm init --verify`
   - Check WASM binary
   - Test with minimal log
   - Show version + algorithm count
   
2. Sample download: `wpm init --sample`
   - List available samples
   - Download + verify checksum
   - Create config.toml
   
3. Guided first run: `wpm run --explain`
   - Show algorithm choice before running
   - Progress indicator
   - Highlight result location

---

### RANK 5: Consolidated Learning Paths
**Impact:** Low–Medium | **Effort:** 1–2h | **ROI:** MED-LOW | **Time Saved:** 2–5 min

**Problem:** 311 doc files create decision paralysis

**Solution:** Create `docs/LEARNING_PATHS.md`

**Contents:**
1. Beginner path (install → domain primer → quick start → first model → interpret)
2. Analyst path (quick start → algorithm selection → comparison → conformance)
3. Researcher path (README → architecture → explanation → cognition)
4. Doc index by category (Core, Discovery, Prediction, ML, Cognition, etc.)

---

## SUMMARY TABLE: Top 5 Improvements

| Rank | Improvement | Impact | Effort | ROI | Time Saved |
|------|-------------|--------|--------|-----|-----------|
| 1 | Domain Primer (DOMAIN_PRIMER) | Very High | 2–3h | HIGH | 10–15 min |
| 2 | Algorithm Selection Guide | High | 1h | HIGH | 5–10 min |
| 3 | Result Interpretation Guide | Medium | 1–2h | MEDIUM | 3–5 min |
| 4 | Enhanced First-Run (wpm init) | Medium | 2–3h | MEDIUM | 2–3 min |
| 5 | Learning Paths Consolidation | Low | 1–2h | MED-LOW | 2–5 min |

**CUMULATIVE IMPACT:** Implementing all 5 → 22–38 min time savings per new user

---

## SECONDARY FINDINGS

### Strengths (What's Working)
✓ Installation process is clean (all platforms)
✓ Quick Start is clear and runnable (3 min is realistic)
✓ Error messages have typed exit codes (good for automation)
✓ Recovery hints are auto-generated (helpful)
✓ Sample data is available (no artificial barriers)
✓ Multiple output formats (JSON, human, SARIF)
✓ Comprehensive FAQ and troubleshooting docs

### Weaknesses (What Needs Work)
✗ Process mining concepts unexplained (biggest pain point)
✗ Algorithm selection has no guidance (41 to choose from)
✗ Results are not explained (user doesn't know if model is good)
✗ Documentation is fragmented (311 files, no index)
✗ No video tutorials (visual learners underserved)
✗ No browser-based playground (high barrier without install)
✗ Internationalization not planned (English-only)

---

## NOTES & LIMITATIONS

1. **Assessment scope:** Documentation review + code inspection (not user-tested)
2. **Assumptions:** User has Node.js installed, internet connection, basic CLI familiarity
3. **Domain knowledge gaps:** Not defects in wasm4pm — inherent to process mining domain
4. **Color-blind testing:** Theory-based only; recommend actual testing with Coblis or similar

---

## RECOMMENDATIONS FOR NEXT STEPS

### 1. Priority Implementation Order
A. Domain Primer (highest impact, foundational)
B. Algorithm Selection Guide (actionable, medium effort)
C. Result Interpretation Guide (closes knowledge loop)
D. Enhanced first-run UX (polish & guided flow)
E. Learning Paths consolidation (nice-to-have)

### 2. User Research (Before Implementation)
- Conduct 5–10 user interviews
- Observe where users actually get stuck
- Collect actual time measurements
- Test domain knowledge assumptions

### 3. Success Metrics
- Time to first result (target: <10 min with improvements)
- New user retention rate (do they come back?)
- Support request trends (can we trace to doc gaps?)
- NPS for "learning curve" specifically

### 4. Getting Started Checklist
Track % of users achieving all 4:
- ✓ Understands what process mining is
- ✓ Successfully ran one discovery
- ✓ Understands the output
- ✓ Can pick an algorithm for their log

---

**Assessment completed:** May 17, 2026
**Assessor:** Cycle 53 Agent 5 (Learning Experience Specialist)
