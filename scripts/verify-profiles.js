#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SIZE_TARGETS_MB = {
  browser: 4.0,  // Feature-gated exports only; full code still linked
  iot: 4.0,
  edge: 4.0,
  fog: 4.0,
  cloud: 5.0,
};

let allPassed = true;
const results = [];

for (const [profile, targetMB] of Object.entries(SIZE_TARGETS_MB)) {
  const wasmPath = path.join(__dirname, "..", "dist", `pictl-${profile}`, "pictl.wasm");

  if (!fs.existsSync(wasmPath)) {
    const msg = `[FAIL] ${profile}: WASM file not found at ${wasmPath}`;
    console.log(msg);
    results.push({ profile, pass: false, msg });
    allPassed = false;
    continue;
  }

  const stats = fs.statSync(wasmPath);
  const sizeMB = stats.size / (1024 * 1024);

  if (sizeMB <= targetMB) {
    const msg = `[PASS] ${profile}: ${sizeMB.toFixed(2)} MB (target: <=${targetMB} MB)`;
    console.log(msg);
    results.push({ profile, pass: true, sizeMB, msg });
  } else {
    const msg = `[FAIL] ${profile}: ${sizeMB.toFixed(2)} MB exceeds ${targetMB} MB target`;
    console.log(msg);
    results.push({ profile, pass: false, sizeMB, msg });
    allPassed = false;
  }
}

console.log("");
console.log(`Result: ${allPassed ? "ALL PASS" : "SOME FAILED"}`);

process.exit(allPassed ? 0 : 1);
