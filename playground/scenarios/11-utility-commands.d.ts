/**
 * Scenario: utility commands — init, results, explain, doctor
 *
 * Dev action simulated: "I scaffolded a new project with `wasm4pm init`, browsed
 * saved results with `wasm4pm results`, got an algorithm explanation with
 * `wasm4pm explain`, and diagnosed the environment with `wasm4pm doctor`."
 *
 * Key contracts verified:
 *   init:
 *     - Creates wasm4pm.toml, .env.example, .gitignore in cwd
 *     - --format json emits { files_created: [...] }
 *     - Re-run without --force skips existing files
 *     - Invalid --config-format exits 1 (config_error)
 *     - --config-format json creates wasm4pm.json, not wasm4pm.toml
 *   results:
 *     - Empty results dir exits 0 (not an error)
 *     - --format json empty → { status:'success', data:{ count:0, results:[] } }
 *     - --cat nonexistent → exit 2 (source_error)
 *     - With a fixture result file → count > 0
 *   explain:
 *     - --algorithm dfg exits 0 (known algorithm)
 *     - Unknown algorithm exits 0 with "No detailed explanation" (NOT exit 2)
 *     - No args exits 2 (source_error)
 *     - --format json --algorithm dfg has content field
 *   doctor:
 *     - Exits 0 (all ok) or 1 (any fail) — never 2 or 3
 *     - --format json has checks array
 *     - Each check has name, status, message fields
 *
 * IMPORTANT: init and results use process.cwd() at runtime — must pass
 * cwd: tempDir option to runCli so files land in the temp dir, not the repo root.
 *
 * Binary: apps/wasm4pm/dist/bin/wasm4pm.js (must be built first)
 */
export {};
//# sourceMappingURL=11-utility-commands.d.ts.map