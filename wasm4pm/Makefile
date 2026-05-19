
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

# ── Real-Data Substrate Certificate ──────────────────────────────────────────
VERSION    := 26.5.19
CERT_DIR   := target/wasm4pm-v$(VERSION)

REAL_DATA_TESTS := \
  real_data_algo_validation \
  pm4py_cross_validation \
  filter_real_data_tests \
  powl_and_prediction_real_data_tests \
  ml_real_data_tests \
  analytics_real_data_tests \
  ocel_real_data_tests \
  conformance_real_data_tests \
  remaining_capabilities_real_data_tests \
  coverage_gap_real_data_tests

.PHONY: real-data real-data-full fake-audit substrate-cert \
        algo-registry bench-real-data bench-real-data-full bench-report \
        substrate-certificate substrate-readiness

real-data:
	@mkdir -p $(CERT_DIR)
	@echo "=== real-data: running $(words $(REAL_DATA_TESTS)) test files ==="
	@REPORT="$(CERT_DIR)/real-data-report.json"; \
	printf '{"version":"$(VERSION)","files":[' > "$$REPORT"; \
	first=1; total_passed=0; total_failed=0; \
	for t in $(REAL_DATA_TESTS); do \
	  echo "  $$t"; \
	  raw=$$(cargo test --test $$t 2>&1 || true); \
	  passed=$$(printf '%s' "$$raw" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo 0); \
	  failed=$$(printf '%s' "$$raw" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0); \
	  status=ok; \
	  printf '%s' "$$raw" | grep -q 'test result: FAILED' && status=FAILED || true; \
	  total_passed=$$((total_passed + passed)); \
	  total_failed=$$((total_failed + failed)); \
	  rec=$$(printf '{"file":"%s","passed":%s,"failed":%s,"status":"%s"}' "$$t" "$$passed" "$$failed" "$$status"); \
	  if [ "$$first" = "1" ]; then printf '%s' "$$rec" >> "$$REPORT"; first=0; \
	  else printf ',%s' "$$rec" >> "$$REPORT"; fi; \
	done; \
	printf '],"summary":{"total_passed":%s,"total_failed":%s}}' $$total_passed $$total_failed >> "$$REPORT"; \
	echo "real-data: $$total_passed passed / $$total_failed failed"; \
	echo "report: $$REPORT"; \
	[ "$$total_failed" -eq 0 ] || exit 1

real-data-full:
	@mkdir -p $(CERT_DIR)
	@echo "=== real-data-full: --all-features ==="
	@REPORT="$(CERT_DIR)/real-data-report.json"; \
	printf '{"version":"$(VERSION)","mode":"all-features","files":[' > "$$REPORT"; \
	first=1; total_passed=0; total_failed=0; \
	for t in $(REAL_DATA_TESTS); do \
	  echo "  $$t (--all-features)"; \
	  raw=$$(cargo test --test $$t --all-features 2>&1 || true); \
	  passed=$$(printf '%s' "$$raw" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo 0); \
	  failed=$$(printf '%s' "$$raw" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0); \
	  status=ok; \
	  printf '%s' "$$raw" | grep -q 'test result: FAILED' && status=FAILED || true; \
	  total_passed=$$((total_passed + passed)); \
	  total_failed=$$((total_failed + failed)); \
	  rec=$$(printf '{"file":"%s","passed":%s,"failed":%s,"status":"%s"}' "$$t" "$$passed" "$$failed" "$$status"); \
	  if [ "$$first" = "1" ]; then printf '%s' "$$rec" >> "$$REPORT"; first=0; \
	  else printf ',%s' "$$rec" >> "$$REPORT"; fi; \
	done; \
	printf '],"summary":{"total_passed":%s,"total_failed":%s}}' $$total_passed $$total_failed >> "$$REPORT"; \
	echo "real-data-full: $$total_passed passed / $$total_failed failed"; \
	[ "$$total_failed" -eq 0 ] || exit 1

fake-audit:
	@mkdir -p $(CERT_DIR)
	@OUTPUT_FILE="$(CURDIR)/$(CERT_DIR)/fake-stub-audit.json" \
	  bash ../scripts/fake-stub-audit.sh

substrate-cert: real-data fake-audit
	@REAL_DATA_REPORT="$(CURDIR)/$(CERT_DIR)/real-data-report.json" \
	  FAKE_AUDIT="$(CURDIR)/$(CERT_DIR)/fake-stub-audit.json" \
	  OUTPUT_FILE="$(CURDIR)/$(CERT_DIR)/substrate-certificate.json" \
	  RELEASE="$(VERSION)" \
	  bash ../scripts/substrate-cert.sh
	@echo "certificate: $(CERT_DIR)/substrate-certificate.json"

# ─────────────────────────────────────────────────────────────────────────────
# BENCHMARK SUITE TARGETS (v26.5.15+)
# ─────────────────────────────────────────────────────────────────────────────

algo-registry:
	@mkdir -p $(CERT_DIR)
	@cd "$(CURDIR)/.." && python3 scripts/generate_algorithm_registry.py \
	  --src-dir wasm4pm/src \
	  --tests-dir wasm4pm/tests \
	  --criterion-dir target/criterion \
	  --output "$(CURDIR)/$(CERT_DIR)/algorithm-registry.json" \
	  --version $(VERSION)

bench-real-data: real-data
	@mkdir -p $(CERT_DIR)
	@cd "$(CURDIR)/.." && python3 scripts/parse_criterion_output.py \
	  --criterion-dir target/criterion \
	  --output "$(CURDIR)/$(CERT_DIR)/criterion-results.json"

bench-real-data-full:
	cargo bench --release -- fast_algorithms slow_algorithms streaming_algorithms analytics conformance_bench 2>&1 | tail -5 || true
	@$(MAKE) bench-real-data

bench-report: algo-registry
	@mkdir -p $(CERT_DIR)
	@cd "$(CURDIR)/.." && python3 scripts/generate_benchmark_report.py \
	  --registry "$(CURDIR)/$(CERT_DIR)/algorithm-registry.json" \
	  --criterion "$(CURDIR)/$(CERT_DIR)/criterion-results.json" \
	  --output-json "$(CURDIR)/$(CERT_DIR)/benchmark-report.json" \
	  --output-md "$(CURDIR)/$(CERT_DIR)/benchmark-report.md" \
	  --version $(VERSION)
	@cd "$(CURDIR)/.." && python3 scripts/generate_blue_ocean_summary.py \
	  --report "$(CURDIR)/$(CERT_DIR)/benchmark-report.json" \
	  --output "$(CURDIR)/$(CERT_DIR)/executive-blue-ocean-summary.md"

substrate-certificate: substrate-cert bench-report
	@cd "$(CURDIR)/.." && python3 scripts/generate_capability_matrix.py \
	  --src-dir wasm4pm/src \
	  --tests-dir wasm4pm/tests \
	  --cargo-toml wasm4pm/Cargo.toml \
	  --output "$(CURDIR)/$(CERT_DIR)/capability-matrix.json" \
	  --version $(VERSION)
	@cd "$(CURDIR)/.." && python3 scripts/update_substrate_cert.py \
	  --cert "$(CURDIR)/$(CERT_DIR)/substrate-certificate.json" \
	  --artifacts \
	    "$(CURDIR)/$(CERT_DIR)/algorithm-registry.json" \
	    "$(CURDIR)/$(CERT_DIR)/benchmark-report.json" \
	    "$(CURDIR)/$(CERT_DIR)/real-data-report.json" \
	    "$(CURDIR)/$(CERT_DIR)/capability-matrix.json" \
	    "$(CURDIR)/$(CERT_DIR)/fake-stub-audit.json"
	@echo "substrate-certificate: $(CERT_DIR)/substrate-certificate.json"

substrate-readiness: substrate-certificate
	@python3 -c "\
import json, sys; \
cert = json.load(open('$(CURDIR)/$(CERT_DIR)/substrate-certificate.json')); \
val = cert.get('certificate_value', ''); \
sys.exit(0) if val != 'RefusedUntilBlockersResolved' else (print('GATE FAILED:', val) or sys.exit(1)); \
print('GATE PASSED:', val)"
