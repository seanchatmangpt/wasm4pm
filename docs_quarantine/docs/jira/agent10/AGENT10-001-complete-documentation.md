# AGENT10-001: Complete Documentation

**Status:** 🟡 READY  
**Priority:** P1 — High (usability)  
**Effort:** 20 hours  
**Complexity:** Low  
**Type:** Documentation  

## Summary

AGENT10 (Documentation) produced skeleton outlines and partial examples but critical sections are incomplete: FAQ entries unfinished, cross-references broken, API examples missing, performance expectations undocumented, troubleshooting guides empty.

## Problem Statement

Current state:
- ✅ Skeleton docs exist (ARCHITECTURE.md, CLI.md, etc.)
- ✅ API reference started (WASM_API.md, ~70 functions documented)
- ❌ 40+ TODO markers in docs
- ❌ FAQ incomplete (9 of 20 entries empty)
- ❌ Performance expectations missing (SLAs unknown)
- ❌ Troubleshooting guide empty
- ❌ Quickstart examples show only `wpm run`, not `wpm predict`, `wpm ml`, etc.
- ❌ Deployment profiles not documented (users don't know what to choose)

User experience:
- ❌ Cannot choose between algorithms (no selection guide)
- ❌ Don't know if 5s runtime is normal or a bug
- ❌ Cannot troubleshoot failures (no diagnostics guide)
- ❌ Cannot optimize performance (no tuning guide)

## Acceptance Criteria

### 1. FAQ Completion (20 entries)
Complete `docs/FAQ.md`:

**Example entries to finish:**
1. "How do I choose between discovery algorithms?" → Link to algorithm selection guide, compare speed/quality
2. "What does exit code 2 mean?" → Document all 6 exit codes with examples
3. "Why is DFG faster than genetic algorithm?" → Explain complexity vs quality tradeoff
4. "How do I use RL agents?" → Document 5 agents, when to use each
5. "What's the difference between balanced and quality profiles?" → Compare features/speed
6. "How do I measure performance?" → Point to benchmarks, explain metrics
7. "Can I use wasm4pm offline?" → Explain zero-dependency design
8. "What event log formats are supported?" → List XES, OCEL, JSON with examples
9. "How do I integrate with my process mining tool?" → Explain MCP server
10. "What's the memory usage?" → Reference deployment profile sizes

**Format:**
```markdown
## Q: How do I choose between discovery algorithms?

**Short answer:** Use DFG for speed, genetic algorithm for accuracy. See [Algorithm Selection Guide](docs/algorithm-selection.md).

**Details:**
- DFG: <1ms, 30% quality, best for real-time
- Genetic: 400ms, 80% quality, best for accuracy
- Heuristic: 25ms, 50% quality, balanced

**Example:**
\`\`\`bash
wpm run --algorithm genetic log.xes  # High accuracy
wpm run --algorithm dfg log.xes      # Fast response
\`\`\`
```

### 2. Troubleshooting Guide

Create `docs/TROUBLESHOOTING.md` with 15 sections:

```markdown
# Troubleshooting Guide

## Exit Code 1 (CONFIG_ERROR)

**Symptom:** `wpm run log.xes` exits with code 1

**Causes:**
- Invalid `wasm4pm.toml` syntax
- Unknown algorithm name in config
- Invalid parameter values

**Solution:**
1. Run `wpm doctor` to validate config
2. Check `wasm4pm.toml` for typos
3. Run `wpm explain algorithm_name` to list valid algorithms

**Example:**
\`\`\`bash
$ wpm run --algorithm invalid-algo log.xes
Exit code: 1 (CONFIG_ERROR)
Error: Unknown algorithm 'invalid-algo'

$ wpm doctor
✓ Config file valid
✓ Event log format recognized
✓ WASM ready
\`\`\`

## Exit Code 2 (SOURCE_ERROR)

**Symptom:** `wpm run /path/to/log.xes` exits with code 2

**Causes:**
- File not found
- Malformed XES/JSON event log
- Missing required attributes (concept:name, time:timestamp)

**Solution:**
1. Verify file exists: `ls -la /path/to/log.xes`
2. Validate XES: `wpm validate /path/to/log.xes`
3. Check attributes match config

## Exit Code 5 (SYSTEM_ERROR)

**Symptom:** `wpm run log.xes` exits with code 5

**Causes:**
- WASM module not loaded
- Out of memory
- Corrupted cache in `.wasm4pm/`

**Solution:**
1. Run `wpm doctor` → check WASM status
2. Clear cache: `rm -rf .wasm4pm/`
3. Increase heap size (Node.js): `NODE_OPTIONS=--max-old-space-size=4096 wpm run log.xes`

## Slow Performance (>5s for 10K events)

**Symptom:** Discovery takes 10+ seconds

**Causes:**
- Using quality-tier algorithm (genetic, ILP) — expected
- Log too large for chosen algorithm
- Machine under load

**Solution:**
1. Run on fast-tier algorithm: `wpm run --algorithm dfg log.xes`
2. Check benchmarks: `wpm --help | grep benchmark`
3. Use `wpm status` to see current resource usage

**Benchmarks (expected timings):**
- DFG: <1ms per 1K events
- Genetic: 400ms per 1K events
- ILP: 1s per 1K events

## OTEL Spans Not Visible in Jaeger

**Symptom:** Jaeger UI shows no spans, service name missing

**Causes:**
- Jaeger not running
- `OTEL_EXPORTER_OTLP_ENDPOINT` not set
- OTEL disabled in config

**Solution:**
1. Start Jaeger: `docker run -p 16686:16686 jaegertracing/all-in-one`
2. Set endpoint: `export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`
3. Enable OTEL: `wasm4pm.toml` → `observability.otel.enabled = true`
```

### 3. Performance Expectations Document

Create `docs/PERFORMANCE.md` with tables and SLAs:

```markdown
# Performance Expectations

## Algorithm Latency (p50 / p99)

| Algorithm | 1K Events | 10K Events | 100K Events |
|-----------|-----------|------------|-------------|
| DFG | 0.5ms / 1.2ms | 5ms / 12ms | 50ms / 120ms |
| Genetic | 400ms / 500ms | 4s / 5s | >10s (OOM) |
| ILP | 1s / 1.2s | >10s | >60s |

## ML Algorithm Accuracy

| Algorithm | Input Size | Accuracy | Training Time |
|-----------|------------|----------|---|
| k-NN (k=5) | 1K | 85% | 10ms |
| Decision Tree | 1K | 93% | 6ms |
| k-Means | 1K | 80% | 3ms |

## Prediction Task Latency

| Task | p50 | p95 | p99 |
|------|-----|-----|-----|
| Next Activity | 0.45ms | 0.68ms | 1.2ms |
| Remaining Time | 0.8ms | 1.1ms | 2.0ms |
| Drift Detection | 1.2ms | 1.8ms | 3.5ms |

## Memory Usage by Deployment Profile

| Profile | WASM Binary | Loaded Memory | Max Heap |
|---------|------------|---------------|----------|
| Mobile | 500KB | 2MB | 50MB |
| IoT | 1MB | 5MB | 100MB |
| Edge | 1.5MB | 8MB | 200MB |
| Fog | 2MB | 12MB | 500MB |
| Browser | 2.7MB | 15MB | 1GB |

## SLA Targets

- **Discovery (real log, 10K events):** <5s p99
- **Prediction (per prediction):** <2ms p99
- **ML algorithms:** <100ms p99 for k-means, <50ms for Naive Bayes
- **MTTR (failure recovery):** <1s
- **Config resolution:** <10ms
- **WASM startup:** <50ms
```

### 4. Quickstart Examples

Expand `docs/QUICKSTART.md` to cover all 20 commands:

```markdown
# Quickstart Guide

## Basic Discovery
\`\`\`bash
wpm run log.xes --format human    # DFG discovery, colored output
wpm run log.xes --format json     # Structured JSON output
\`\`\`

## Prediction Tasks
\`\`\`bash
wpm predict next-activity -i log.xes     # Which activity happens next?
wpm predict remaining-time -i log.xes    # How long until case completes?
wpm predict drift -i log.xes             # Is the process changing?
\`\`\`

## ML Analysis
\`\`\`bash
wpm ml classify -i log.xes --features activity,duration --target outcome
wpm ml cluster -i log.xes --k 5
wpm ml anomaly -i log.xes --threshold 0.1
\`\`\`

## Quality & Conformance
\`\`\`bash
wpm quality -i log.xes --model model.json                # Fitness, precision, etc.
wpm conformance -i log.xes --model petrinet.json        # How well does log match model?
wpm validate -i log.xes                                  # Check log schema
\`\`\`

## RL Agent Management
\`\`\`bash
wpm autoprocess -i log.xes                              # Autonomic optimization
\`\`\`

## Utility Commands
\`\`\`bash
wpm doctor                                               # Environment checks
wpm init --preset balanced                              # Scaffold config
wpm results list                                         # Browse saved results
wpm explain dfg                                          # How DFG works
\`\`\`
```

### 5. Deployment Profile Guide

Create `docs/DEPLOYMENT_PROFILES.md`:

```markdown
# Deployment Profiles

Choose a profile based on your environment and requirements.

## Mobile (~500KB)
**Target:** Mobile phones, PWAs
**Algorithms:** 10-15 (fast discovery only)
**Features:** ❌ ML, ❌ POWL, ❌ Streaming, ✅ DFG, ✅ Alpha+
**Use if:** App needs to run on mobile with minimal footprint

\`\`\`bash
npm install wasm4pm --profile mobile
\`\`\`

## IoT (~1MB)
**Target:** IoT devices, embedded systems
**Algorithms:** 12-18 (balanced discovery)
**Features:** ❌ ML, ❌ POWL, ✅ Streaming basic, ✅ DFG, ✅ Genetic
**Use if:** Device has limited storage but sufficient CPU

## Edge (~1.5MB)
**Target:** CDN workers, edge servers
**Algorithms:** 18-25 (advanced discovery, streaming)
**Features:** ✅ ML, ❌ POWL, ✅ Streaming full, ❌ GPU
**Use if:** Running on Cloudflare Workers or Fastly

## Fog (~2MB)
**Target:** Gateways, on-prem servers
**Algorithms:** 35-40 (all except POWL)
**Features:** ✅ ML, ❌ POWL, ✅ Streaming full, ✅ OCEL
**Use if:** On-premises deployment with 2GB+ RAM available

## Browser (~2.7MB)
**Target:** Web browsers, Node.js servers (default)
**Algorithms:** 41 (all algorithms)
**Features:** ✅ ML, ✅ POWL, ✅ Streaming, ✅ OCEL, ✅ GPU (via wgpu)
**Use if:** No size constraints; need all algorithms

## Profile Comparison Table

| Requirement | Mobile | IoT | Edge | Fog | Browser |
|---|---|---|---|---|---|
| Memory usage | <50MB | <100MB | <200MB | <500MB | <1GB |
| Max log size | 1K events | 10K events | 100K events | 1M events | ∞ |
| Fast algorithms | ✅ | ✅ | ✅ | ✅ | ✅ |
| ML support | ❌ | ❌ | ✅ | ✅ | ✅ |
| Streaming | ❌ | Basic | Full | Full | Full |
| POWL | ❌ | ❌ | ❌ | ❌ | ✅ |

### Recommended Profiles by Use Case

| Use Case | Profile |
|----------|---------|
| React Native app | Mobile |
| Arduino / Raspberry Pi | IoT |
| Cloudflare Worker | Edge |
| Enterprise server | Fog |
| Web app / SaaS | Browser |
```

### 6. Algorithm Selection Guide Update

Enhance `docs/ALGORITHM_SELECTION_GUIDE.md` with decision tree:

```markdown
# Algorithm Selection Guide

## Quick Decision Tree

```
Start
├─ Need real-time response (<1ms)?
│  └─ YES → Use DFG
├─ Have <5s budget?
│  ├─ YES + want high quality (>75%) → Use Heuristic Miner
│  └─ NO + want highest quality (>85%) → Use Genetic Algorithm or ILP
└─ Event count?
   ├─ <1K → Any algorithm OK
   ├─ 1K-10K → Avoid ILP, use Genetic OK
   ├─ 10K-100K → Use DFG, Heuristic, Streaming
   └─ >100K → Use Streaming DFG only
```

## By Use Case

| Use Case | Recommended | Why |
|----------|---|---|
| Real-time monitoring | DFG | Fast response |
| Data exploration | Heuristic Miner | Balanced |
| Research/publication | Genetic, ILP | High quality |
| Conformance checking | Token Replay | Simple fitness |
| Drift detection | Streaming DFG | Incremental processing |
```

## Definition of Done

- ✅ FAQ: 20 entries complete (no TODOs)
- ✅ TROUBLESHOOTING.md: 15 sections with solutions + examples
- ✅ PERFORMANCE.md: SLA tables, latency benchmarks, memory profiles
- ✅ QUICKSTART.md: All 20 commands with examples
- ✅ DEPLOYMENT_PROFILES.md: Decision tree + selection guide
- ✅ ALGORITHM_SELECTION_GUIDE.md: Enhanced with decision tree
- ✅ All cross-references correct (no broken links)
- ✅ All examples tested and runnable
- ✅ Markdown lint: 0 violations

## Implementation Plan

### Phase 1: FAQ & Troubleshooting (8 hours)
1. Complete FAQ.md (20 entries)
2. Create TROUBLESHOOTING.md (15 sections)
3. Add examples and test commands
4. Cross-check with actual behavior

### Phase 2: Performance Documentation (6 hours)
1. Create PERFORMANCE.md with SLA tables
2. Verify numbers against benchmarks (AGENT6, AGENT7)
3. Add memory usage by profile
4. Document optimization techniques

### Phase 3: Examples & Guides (4 hours)
1. Expand QUICKSTART.md with all 20 commands
2. Create DEPLOYMENT_PROFILES.md with decision tree
3. Enhance ALGORITHM_SELECTION_GUIDE.md
4. Add visual decision trees

### Phase 4: QA & Validation (2 hours)
1. Check all examples are runnable
2. Verify all cross-references exist
3. Markdown lint + spell check
4. Test broken link detection

## Metrics

- Lines of code: ~3,000
- Files created: 3 (TROUBLESHOOTING.md, PERFORMANCE.md, DEPLOYMENT_PROFILES.md)
- Files modified: 3 (FAQ.md, QUICKSTART.md, ALGORITHM_SELECTION_GUIDE.md)
- Examples added: 50+
- Decision trees: 2
- SLA tables: 5

## Dependencies

- AGENT6-001: ML benchmarks (for performance numbers)
- AGENT7-001: Prediction benchmarks (for performance numbers)
- AGENT4-002: CLI commands (for command examples)

## Blockers

- AGENT4-002: All 20 CLI commands must be implemented before finalizing examples

## Related Issues

- AGENT4-002: CLI command implementation (feeds quickstart examples)
- AGENT6-001: Provides performance data
- AGENT7-001: Provides performance data
