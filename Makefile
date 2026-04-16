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
        bench-save-baseline bench-compare bench-regression bench-trends clean-bench help doctor

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
	@cd $(PKG_DIR) && cargo build --release --benches --jobs $(JOBS) --quiet
	@echo "Running $(JOBS) Criterion groups in parallel..."
	@BENCH_OUT=$$(mktemp); \
	 cd $(PKG_DIR) && \
	 cargo bench --bench fast_algorithms     -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID1=$$!; \
	 cargo bench --bench medium_algorithms   -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID2=$$!; \
	 cargo bench --bench slow_algorithms     -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID3=$$!; \
	 cargo bench --bench analytics           -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID4=$$!; \
	 cargo bench --bench conformance         -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID5=$$!; \
	 cargo bench --bench hot_kernels         -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID6=$$!; \
	 cargo bench --bench tier1_discovery     -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID7=$$!; \
	 cargo bench --bench tier2_metaheuristic -- --output-format bencher --warm-up-time 1 --measurement-time 3 & PID8=$$!; \
	 wait $$PID1 $$PID2 $$PID3 $$PID4 $$PID5 $$PID6 $$PID7 $$PID8 | tee $$BENCH_OUT; \
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
	@cd $(PKG_DIR) && pnpm run build:nodejs --silent
	@echo "Running WASM worker pool..."
	@cd $(PKG_DIR) && node benchmarks/wasm_bench_runner.js

# ── Download real BPI Challenge datasets ─────────────────────────────────────
bench-data:
	@bash scripts/download_datasets.sh

# ── CI mode: faster (--profile-time), no statistical sampling ────────────────
bench-ci:
	@echo "=== CI Benchmark Mode ==="
	@mkdir -p $(RESULTS_DIR)
	@cd $(PKG_DIR) && cargo build --release --benches --jobs $(JOBS) --quiet
	@cd $(PKG_DIR) && \
	 cargo bench --bench fast_algorithms   -- --profile-time 3 & \
	 cargo bench --bench medium_algorithms -- --profile-time 3 & \
	 cargo bench --bench analytics         -- --profile-time 3 & \
	 wait
	@cd $(PKG_DIR) && node benchmarks/wasm_bench_runner.js --ci

# ── Quick smoke-test (no stats, just verify compilation + basic run) ──────────
bench-quick:
	@cd $(PKG_DIR) && cargo bench --bench analytics -- --test

# ── Baseline management ───────────────────────────────────────────────────────
bench-save-baseline:
	@LABEL=$${LABEL:-main}; \
	cd $(PKG_DIR) && \
	for b in fast_algorithms medium_algorithms slow_algorithms analytics conformance; do \
	    cargo bench --bench $$b -- --save-baseline $$LABEL --profile-time 5; \
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

# ── Update Main Baseline: Runs after merge to main ──────────────────────────
bench-baseline-update:
	@bash .pictl/benchmarks/update-baseline.sh

bench-baseline-update-ci:
	@bash .pictl/benchmarks/update-baseline.sh --ci

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
	@echo "wasm4pm Benchmark Targets:"
	@echo "  make bench              — Full suite (Rust + WASM, concurrent)"
	@echo "  make bench-rust         — Criterion-only (5 groups in parallel)"
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
	@echo "  make doctor             — Run environment diagnostics (24 checks)"
