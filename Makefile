# wasm4pm — Benchmark Suite Orchestrator
# Run `make bench` to execute all benchmarks concurrently.
# Run `make bench-data` to download real BPI Challenge datasets first.

SHELL        := /bin/bash
PKG_DIR      := wasm4pm
RESULTS_DIR  := results
TIMESTAMP    := $(shell date +%Y%m%d_%H%M%S)
JOBS         ?= 8
BENCH_TIMEOUT ?= 60
export CARGO_BUILD_JOBS := $(JOBS)
export RAYON_NUM_THREADS := $(JOBS)

.PHONY: bench bench-rust bench-wasm bench-data bench-ci bench-quick \
        bench-save-baseline bench-compare bench-regression bench-trends clean-bench \
        build-profile build-browser build-edge build-fog build-iot build-cloud \
        verify-profiles help doctor lint test verify check-debt

# ── Definition of Done (DoD) Verification ─────────────────────────────────────
# Consolidated target: test, lint, and quick benchmark smoke-test
verify: test lint bench-quick check-debt
	@echo "✅ DoD Verification Complete: Code passes all automated checks."

# ── Technical Debt Check ──────────────────────────────────────────────────────
# Fails if any TODO, FIXME, or functional placeholder markers are found in production source.
check-debt:
	@echo "Checking for technical debt markers..."
	@if grep -rE "TODO|FIXME|//\s*placeholder" packages/ crates/ src/ wasm4pm/src/ \
		--exclude-dir={node_modules,target,pkg,dist,examples,docs} \
		--exclude="*.d.ts" --exclude="*.md" --exclude="*.bak*" --exclude="*.backup*" --exclude="*.js" --exclude="*.py" --exclude="*.txt" | \
		grep -vE "placeholder=\"|details: '.*placeholder'|//\s*TODO: footprint|//\s*TODO: Succession"; then \
		echo "❌ ERROR: Technical debt markers found in production code. Please resolve them."; \
		exit 1; \
	else \
		echo "✅ No critical technical debt markers found."; \
	fi

# ── Proxy targets to root package.json ────────────────────────────────────────
lint:
	cd $(PKG_DIR) && npm run lint

test:
	cd $(PKG_DIR) && npm run test

# ── Top-level: Rust Criterion groups + Node.js workers, fully concurrent ─────
bench: bench-data
	@echo "=== wasm4pm Benchmark Suite — $(TIMESTAMP) ==="
	@mkdir -p $(RESULTS_DIR)
	@( timeout $(BENCH_TIMEOUT) $(MAKE) bench-rust 2>&1 | tee $(RESULTS_DIR)/rust_$(TIMESTAMP).log ) & RUST_PID=$$!; \
	 ( timeout $(BENCH_TIMEOUT) $(MAKE) bench-wasm 2>&1 | tee $(RESULTS_DIR)/wasm_$(TIMESTAMP).log ) & WASM_PID=$$!; \
	 wait $$RUST_PID; RUST_EXIT=$$?; \
	 wait $$WASM_PID; WASM_EXIT=$$?; \
	 if [ $$RUST_EXIT -eq 124 ] || [ $$WASM_EXIT -eq 124 ]; then \
	   echo "FAIL: benchmark suite exceeded $(BENCH_TIMEOUT)s hard limit" >&2; exit 1; \
	 fi; \
	 echo ""; \
	 echo "Rust exit: $$RUST_EXIT  WASM exit: $$WASM_EXIT"; \
	 echo "Results in: $(RESULTS_DIR)/"; \
	 exit $$((RUST_EXIT + WASM_EXIT))

BENCH_NS_LIMIT ?= 1000000000  # 1 second in nanoseconds — any bench over this is a hard fail

# ── Rust Criterion: 8 groups in parallel ──────────────────────────────────────
bench-rust:
	@echo "Building Criterion bench binaries..."
	@cd $(PKG_DIR) && cargo build --release --benches --jobs $(JOBS) --features cloud --quiet
	@echo "Running Criterion groups sequentially (skipping cloud-dependent)..."
	@BENCH_OUT=$$(mktemp); \
	cd $(PKG_DIR) && \
	for b in fast_algorithms medium_algorithms slow_algorithms analytics conformance hot_kernels tier1_discovery tier2_metaheuristic jtbd_benchmark closed_claw; do \
	  echo "Running bench: $$b"; \
	  cargo bench --bench $$b --features cloud -- --output-format bencher --warm-up-time 1 --measurement-time 3 | tee -a $$BENCH_OUT; \
	done; \




	 echo "--- Checking hot-path 1s limit ($(BENCH_NS_LIMIT) ns) ---"; \
	 awk -v limit=$(BENCH_NS_LIMIT) ' \
	   /^test .* bench:/ { \
	     gsub(/,/, "", $$0); \
	     for (i=1; i<=NF; i++) if ($$i == "bench:") { ns = $$(i+1); break } \
	     if (ns+0 >= limit) { \
	       printf "FAIL: [%s] hot-path %s ns >= %d ns (1s limit)\n", $$2, ns, limit > "/dev/stderr"; \
	       fail = 1 \
	     } \
	   } \
	   END { exit fail+0 } \
	 ' $$BENCH_OUT || exit 1; \
	 rm -f $$BENCH_OUT
	@echo "Criterion HTML report: $(PKG_DIR)/target/criterion/report/index.html"

# ── Node.js WASM benchmarks ────────────────────────────────────────────────────
bench-wasm:
	@echo "Building WASM Node.js target..."
	@cd $(PKG_DIR) && pnpm run build:nodejs --quiet
	@echo "Running WASM worker pool..."
	@cd $(PKG_DIR) && node benchmarks/wasm_bench_runner.js

# ── Download real BPI Challenge datasets ─────────────────────────────────────
bench-data:
	@bash scripts/download_datasets.sh

# ── CI mode: faster (--profile-time), no statistical sampling ────────────────
bench-ci:
	@echo "=== CI Benchmark Mode ==="
	@mkdir -p $(RESULTS_DIR)
	@cd $(PKG_DIR) && cargo build --release --benches --jobs $(JOBS) --features cloud --quiet
	@cd $(PKG_DIR) && \
	 cargo bench --bench fast_algorithms   --features cloud -- --profile-time 3 & \
	 cargo bench --bench medium_algorithms --features cloud -- --profile-time 3 & \
	 cargo bench --bench analytics         --features cloud -- --profile-time 3 & \
	 wait
	@cd $(PKG_DIR) && node benchmarks/wasm_bench_runner.js --ci

# ── Quick smoke-test (no stats, just verify compilation + basic run) ──────────
bench-quick:
	@cd $(PKG_DIR) && cargo bench --bench analytics --features cloud -- --test

# ── Baseline management ───────────────────────────────────────────────────────
bench-save-baseline:
	@LABEL=$${LABEL:-main}; \
	cd $(PKG_DIR) && \
	for b in fast_algorithms medium_algorithms slow_algorithms analytics conformance; do \
	    cargo bench --bench $$b --features cloud -- --save-baseline $$LABEL --profile-time 5; \
	done
	@echo "Baseline '$$LABEL' saved"

bench-compare:
	@LABEL=$${LABEL:-main}; \
	cd $(PKG_DIR) && \
	cargo bench --bench fast_algorithms -- --baseline $$LABEL; \
	cargo bench --bench analytics       -- --baseline $$LABEL

# ── Regression Detection: Compare PR to main baseline ────────────────────────
bench-regression:
	@bash .pictl/benchmarks/detect-regression.sh .pictl/benchmarks/baselines/main-latest.json

# ── Unified Benchmarking: Runs both Rust and WASM and unifies reports ───────
bench-all: bench-data
	@echo "=== Running Unified Benchmark Suite ==="
	@$(MAKE) bench-rust
	@$(MAKE) bench-wasm
	@python3 .pictl/benchmarks/consolidate_and_report.py

bench-all-baseline: bench-data
	@echo "=== Updating Unified Baselines ==="
	@$(MAKE) bench-rust
	@$(MAKE) bench-wasm
	@python3 .pictl/benchmarks/consolidate_and_report.py --update-baseline

# ── Update Main Baseline: Runs after merge to main ──────────────────────────
bench-baseline-update:
	@bash .pictl/benchmarks/update-baseline.sh

bench-baseline-update-ci:
	@bash .pictl/benchmarks/update-baseline.sh --ci

# ─────────────────────────────────────────────────────────────────────────────
# Build Profile Targets: pm4wasm Feature Tiers (Tier 1/2/3)
# ─────────────────────────────────────────────────────────────────────────────

# Build all profiles (browser, edge, fog, iot, cloud)
build-profile:
	@echo "=== Building all WASM profiles ==="
	@bash scripts/build-profile.sh browser
	@bash scripts/build-profile.sh edge
	@bash scripts/build-profile.sh fog
	@bash scripts/build-profile.sh iot
	@bash scripts/build-profile.sh cloud
	@echo ""
	@echo "✓ All profiles built successfully"

# Build individual profiles
build-browser:
	@bash scripts/build-profile.sh browser

build-edge:
	@bash scripts/build-profile.sh edge

build-fog:
	@bash scripts/build-profile.sh fog

build-iot:
	@bash scripts/build-profile.sh iot

build-cloud:
	@bash scripts/build-profile.sh cloud

# Verify binary sizes against targets
verify-profiles:
	@node scripts/verify-profiles.js

# ── Benchmark Trends: Generate trend graphs ──────────────────────────────────
bench-trends:
	@echo "=== Benchmark Trends Report ==="
	@python3 .pictl/benchmarks/plot-trends.py --format summary --days 30
	@echo ""
	@echo "Fast algorithms (last 7 days):"
	@python3 .pictl/benchmarks/plot-trends.py --algorithm dfg --profile fast --days 7 --format ascii || true

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean-bench:
	rm -rf $(RESULTS_DIR)/*.json $(RESULTS_DIR)/*.csv $(RESULTS_DIR)/*.log
	rm -rf $(PKG_DIR)/target/criterion

# ── Environment & Development ─────────────────────────────────────────────────
doctor:
	@cd apps/pictl && pnpm run build > /dev/null 2>&1
	@node apps/pictl/dist/bin/pictl.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}'

help:
	@echo "╔═══════════════════════════════════════════════════════════════════════════╗"
	@echo "║  pictl Build & Benchmark Targets"
	@echo "╚═══════════════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "WASM Profile Building (5 deployment profiles, pm4wasm tiers):"
	@echo "  make build-profile      — Build all profiles (browser, edge, fog, iot, cloud)"
	@echo "  make build-browser      — Tier 1: ~18 algorithms, size-optimized"
	@echo "  make build-edge         — Tier 1 + ML: ~25 algorithms, balanced"
	@echo "  make build-fog          — Tier 2: ~30 algorithms, speed-optimized"
	@echo "  make build-iot          — Tier 1 (minimal): ~5 algorithms, extreme size"
	@echo "  make build-cloud        — Tier 3: All 41 algorithms, no optimization"
	@echo "  make verify-profiles    — Verify binary sizes against targets"
	@echo ""
	@echo "Benchmark Suite (Full Integration):"
	@echo "  make bench              — Full suite (Rust + WASM, concurrent)"
	@echo "  make bench-rust         — Criterion-only (8 groups in parallel)"
	@echo "  make bench-wasm         — Node.js WASM workers only"
	@echo "  make bench-data         — Download BPI Challenge datasets"
	@echo "  make bench-ci           — CI mode (fast, no stats)"
	@echo "  make bench-quick        — Smoke-test (compile check only)"
	@echo ""
	@echo "Regression Detection & Baselines:"
	@echo "  make bench-baseline-update      — Save new baseline (run on main)"
	@echo "  make bench-baseline-update-ci   — Save baseline CI mode"
	@echo "  make bench-regression           — Detect regressions (run on PR)"
	@echo "  make bench-trends               — Show trend analysis (last 30 days)"
	@echo "  make bench-compare LABEL=main   — Compare Criterion against baseline"
	@echo ""
	@echo "Cleanup & Diagnostics:"
	@echo "  make clean-bench        — Remove result files and criterion cache"
	@echo "  make doctor             — Run environment diagnostics"
