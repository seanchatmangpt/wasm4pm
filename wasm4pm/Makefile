
# CI/Lint Enforcement
check-all:
	cargo fmt --check
	cargo clippy -- -D warnings
	npm run lint

# Type Generation
generate-types:
	cargo test -p wasm4pm ts_rs_export --features bcinr
	@echo "Types generated successfully in target/ts-rs"

# ── Benchmarks ────────────────────────────────────────────────────────────────
# bench       — fast mode (default): 1 input size, 10 samples, ~4s total
# bench-smoke — smoke mode: run each benchmark once, no timing, ~2s total
# bench-full  — full mode (opt-in): 3 input sizes, 20 samples, ~30s per binary
CORE_BENCHES = --bench tier1_discovery --bench analytics \
  --bench streaming_algorithms --bench streaming_vs_batch \
  --bench oracle_rank_validation --bench prediction_baseline_comparison \
  --bench ocel_flattening --bench ml_algorithms --bench conformance

bench:
	cargo bench $(CORE_BENCHES)

bench-smoke:
	cargo bench $(CORE_BENCHES) -- --test 2>&1 | grep -E 'ok|FAILED'

bench-full:
	BENCH_FULL=1 cargo bench $(CORE_BENCHES)
