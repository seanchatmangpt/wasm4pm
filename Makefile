# wasm4pm — Benchmark Suite Orchestrator
# Run `make bench` to execute all benchmarks concurrently.
# Run `make bench-data` to download real BPI Challenge datasets first.

SHELL        := /bin/bash
PKG_DIR      := wasm4pm
RESULTS_DIR  := results
TIMESTAMP    := $(shell date +%Y%m%d_%H%M%S)

.PHONY: bench bench-rust bench-wasm bench-data bench-ci bench-quick \
        bench-save-baseline bench-compare bench-regression bench-trends clean-bench help doctor

# ── Top-level: Rust Criterion groups + Node.js workers, fully concurrent ─────
bench: bench-data
	@echo "=== wasm4pm Benchmark Suite — $(TIMESTAMP) ==="
	@mkdir -p $(RESULTS_DIR)
	@( $(MAKE) bench-rust 2>&1 | tee $(RESULTS_DIR)/rust_$(TIMESTAMP).log ) & RUST_PID=$$!; \
	 ( $(MAKE) bench-wasm 2>&1 | tee $(RESULTS_DIR)/wasm_$(TIMESTAMP).log ) & WASM_PID=$$!; \
	 wait $$RUST_PID; RUST_EXIT=$$?; \
	 wait $$WASM_PID; WASM_EXIT=$$?; \
	 echo ""; \
	 echo "Rust exit: $$RUST_EXIT  WASM exit: $$WASM_EXIT"; \
	 echo "Results in: $(RESULTS_DIR)/"; \
	 exit $$((RUST_EXIT + WASM_EXIT))

# ── Rust Criterion: 5 groups in parallel ──────────────────────────────────────
bench-rust:
	@echo "Building Criterion bench binaries..."
	@cd $(PKG_DIR) && cargo build --release --benches --quiet
	@echo "Running Criterion groups in parallel..."
	@cd $(PKG_DIR) && \
	 cargo bench --release --bench fast_algorithms   -- --output-format bencher & PID1=$$!; \
	 cargo bench --release --bench medium_algorithms -- --output-format bencher & PID2=$$!; \
	 cargo bench --release --bench slow_algorithms   -- --output-format bencher & PID3=$$!; \
	 cargo bench --release --bench analytics         -- --output-format bencher & PID4=$$!; \
	 cargo bench --release --bench conformance       -- --output-format bencher & PID5=$$!; \
	 wait $$PID1 $$PID2 $$PID3 $$PID4 $$PID5
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
	@cd $(PKG_DIR) && cargo build --release --benches --quiet
	@cd $(PKG_DIR) && \
	 cargo bench --release --bench fast_algorithms   -- --profile-time 5 & \
	 cargo bench --release --bench medium_algorithms -- --profile-time 8 & \
	 cargo bench --release --bench analytics         -- --profile-time 5 & \
	 wait
	@cd $(PKG_DIR) && node benchmarks/wasm_bench_runner.js --ci

# ── Quick smoke-test (no stats, just verify compilation + basic run) ──────────
bench-quick:
	@cd $(PKG_DIR) && cargo bench --release --bench fast_algorithms -- --test

# ── Baseline management ───────────────────────────────────────────────────────
bench-save-baseline:
	@LABEL=$${LABEL:-main}; \
	cd $(PKG_DIR) && \
	for b in fast_algorithms medium_algorithms slow_algorithms analytics conformance; do \
	    cargo bench --release --bench $$b -- --save-baseline $$LABEL --profile-time 5; \
	done
	@echo "Baseline '$$LABEL' saved"

bench-compare:
	@LABEL=$${LABEL:-main}; \
	cd $(PKG_DIR) && \
	cargo bench --release --bench fast_algorithms -- --baseline $$LABEL; \
	cargo bench --release --bench analytics       -- --baseline $$LABEL

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
	@cd apps/pmctl && pnpm run build > /dev/null 2>&1
	@node apps/pmctl/dist/bin/pmctl.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}'

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
