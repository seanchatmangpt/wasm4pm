#!/usr/bin/env npx tsx
// @ts-nocheck
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { hash as blake3Hash } from "blake3";
import { canonicalStringify } from '@wasm4pm/contracts';

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
  const computedBatchHash = blake3Hash(canonicalOcel2).toString("hex");

  let batchValid = computedBatchHash === ocel2_batch_hash;
  console.log(`\n  [Batch Check]`);
  console.log(`    Expected: ${ocel2_batch_hash}`);
  console.log(`    Computed: ${computedBatchHash}`);
  console.log(`    Result:   ${batchValid ? "✅ MATCH" : "❌ MISMATCH"}`);

  // Step 2: Recompute Receipt Admission Signature
  const receiptSeed = `${session_id}:${computedBatchHash}:${expected_path_hash}`;
  const computedReceiptHash = blake3Hash(receiptSeed).toString("hex");

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
