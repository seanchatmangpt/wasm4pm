
# CI/Lint Enforcement
check-all:
	cargo fmt --check
	cargo clippy -- -D warnings
	npm run lint

# Type Generation
generate-types:
	cargo test -p wasm4pm ts_rs_export --features bcinr
	@echo "Types generated successfully in target/ts-rs"
