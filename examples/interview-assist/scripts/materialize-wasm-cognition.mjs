import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Tracked fresh-checkout bootstrap. Materialize into this package's node_modules
// so cognition-adapter.ts uses the same bare server-side require in local and
// CI installations.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repositoryRoot = resolve(packageDir, "../..");
const crateDir = resolve(repositoryRoot, "crates/wasm4pm-cognition");
const outputDir = resolve(packageDir, "node_modules/wasm4pm-cognition");

if (process.env.WASM4PM_SKIP_COGNITION_MATERIALIZE === "1") {
  console.log("Skipping wasm4pm-cognition materialization by request.");
  process.exit(0);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  "wasm-pack",
  ["build", crateDir, "--target", "nodejs", "--out-dir", outputDir, "--", "--features", "wasm"],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  console.error(`Unable to execute wasm-pack: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`wasm4pm-cognition materialization failed with exit code ${String(result.status)}`);
  process.exit(result.status ?? 1);
}

console.log(`Materialized wasm4pm-cognition into ${outputDir}`);
