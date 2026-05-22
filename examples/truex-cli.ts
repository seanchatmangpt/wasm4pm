#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

// --- CANONICAL HASHING ---
// Strictly follows Truex Canonicalization & Receipt Profile v1
function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  
  if (Array.isArray(obj)) {
    // Determine if this array needs deterministic sorting
    if (obj.length > 0 && typeof obj[0] === "object") {
      const clone = [...obj];
      
      // events & objects (sort by ocel:id)
      if (clone[0]["ocel:id"]) {
        clone.sort((a, b) => (a["ocel:id"] > b["ocel:id"] ? 1 : -1));
      } 
      // event-object (sort by event-id + object-id + qualifier)
      else if (clone[0]["ocel:event-id"] && clone[0]["ocel:object-id"]) {
        clone.sort((a, b) => {
          const keyA = `${a["ocel:event-id"]}|${a["ocel:object-id"]}|${a["ocel:qualifier"]}`;
          const keyB = `${b["ocel:event-id"]}|${b["ocel:object-id"]}|${b["ocel:qualifier"]}`;
          return keyA > keyB ? 1 : -1;
        });
      }
      // objectChanges (sort by object-id + time + field)
      else if (clone[0]["ocel:object-id"] && clone[0]["ocel:field"]) {
        clone.sort((a, b) => {
          const keyA = `${a["ocel:object-id"]}|${a["ocel:timestamp"] || a["ocel:time"]}|${a["ocel:field"]}`;
          const keyB = `${b["ocel:object-id"]}|${b["ocel:timestamp"] || b["ocel:time"]}|${b["ocel:field"]}`;
          return keyA > keyB ? 1 : -1;
        });
      }
      return `[${clone.map(canonicalStringify).join(",")}]`;
    }
    
    return `[${obj.map(canonicalStringify).join(",")}]`;
  }
  
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `"${k}":${canonicalStringify(obj[k])}`).join(",")}}`;
}

function verifyReceipt(targetPath: string) {
  const fullPath = resolve(process.cwd(), targetPath);
  console.log(`[Truex Verifier] Reading envelope from: ${fullPath}`);
  
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (e: any) {
    console.error(`❌ [IO Error] Failed to read JSON: ${e.message}`);
    process.exit(1);
  }

  const { session_id, expected_path_hash, ocel2_batch_hash, receipt_hash, ocel2, admission_status } = envelope;

  // Step 1: Recompute OCEL 2.0 Canonical Batch Hash
  const canonicalOcel2 = canonicalStringify(ocel2);
  const computedBatchHash = createHash("sha256").update(canonicalOcel2).digest("hex");

  let batchValid = computedBatchHash === ocel2_batch_hash;
  console.log(`\n  [Batch Check]`);
  console.log(`    Expected: ${ocel2_batch_hash}`);
  console.log(`    Computed: ${computedBatchHash}`);
  console.log(`    Result:   ${batchValid ? "✅ MATCH" : "❌ MISMATCH"}`);

  // Step 2: Recompute Receipt Admission Signature
  const receiptSeed = `${session_id}:${computedBatchHash}:${expected_path_hash}`;
  const computedReceiptHash = createHash("sha256").update(receiptSeed).digest("hex");

  let receiptValid = computedReceiptHash === receipt_hash;
  console.log(`\n  [Receipt Signature Check]`);
  console.log(`    Expected: ${receipt_hash}`);
  console.log(`    Computed: ${computedReceiptHash}`);
  console.log(`    Result:   ${receiptValid ? "✅ MATCH" : "❌ MISMATCH"}`);

  console.log(`\n======================================================`);
  if (batchValid && receiptValid) {
    console.log(` ✅ RECEIPT VERIFIED`);
    console.log(`    Status: ${admission_status}`);
    console.log(`======================================================\n`);
  } else {
    console.log(` ❌ RECEIPT FORGED (INTEGRITY COMPROMISED)`);
    console.log(`======================================================\n`);
    process.exit(1);
  }
}

import { defineCommand, runMain } from "citty";
import { runCaptureDemo } from "./truex-capture-otlp.ts";

const verify = defineCommand({
  meta: {
    name: "verify",
    description: "Verify a Truex OCEL 2.0 Canonical Receipt Envelope"
  },
  args: {
    target: {
      type: "positional",
      description: "Path to the Truex Envelope JSON payload",
      required: true
    }
  },
  run({ args }) {
    verifyReceipt(args.target);
  }
});

const capture = defineCommand({
  meta: {
    name: "capture",
    description: "Run the Truex Capture Edge Telemetry Demo (Generates Payload)"
  },
  async run() {
    console.log("[Truex CLI] Starting Capture Demo...");
    await runCaptureDemo();
  }
});

const main = defineCommand({
  meta: {
    name: "truex-cli",
    version: "1.0.0",
    description: "Truex Command Line Interface for OCEL 2.0 Trust"
  },
  subCommands: {
    verify,
    capture
  }
});

runMain(main);
