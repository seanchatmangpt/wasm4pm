import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { hash as blake3Hash } from "blake3";
// @ts-ignore
import { createProxy, createContext } from "../vendors/proxyable/src/index.js";

import { canonicalStringify } from '@wasm4pm/contracts';

// --- STRICT OCEL 2.0 SCHEMA ---
interface Ocel2Log {
  eventTypes: Record<string, any>;
  objectTypes: Record<string, any>;
  events: any[];
  objects: any[];
  "event-object": any[];
  "object-object": any[];
  objectChanges: any[];
}

// --- DURABLE QUEUE (FILE BACKED) ---
class DurableQueue {
  constructor(private filepath: string) {
    if (!existsSync(filepath)) writeFileSync(filepath, JSON.stringify({ events: [], objectChanges: [], eventObjectRels: [] }));
  }

  public push(evt: any, changes: any[], rels: any[]) {
    const data = JSON.parse(readFileSync(this.filepath, "utf8"));
    data.events.push(evt);
    data.objectChanges.push(...changes);
    data.eventObjectRels.push(...rels);
    writeFileSync(this.filepath, JSON.stringify(data));
  }

  public flush() {
    const data = JSON.parse(readFileSync(this.filepath, "utf8"));
    writeFileSync(this.filepath, JSON.stringify({ events: [], objectChanges: [], eventObjectRels: [] }));
    return data;
  }
}

// --- EXPECTED VS OBSERVED ADMISSION ---
const EXPECTED_PATH = ["idle", "cart_updated", "address_added", "processing", "paid"];
const EXPECTED_PATH_HASH = createHash("sha256").update(EXPECTED_PATH.join("->")).digest("hex");

// --- TRUEX CAPTURE SYSTEM ---
class TruexCapture {
  private queue: DurableQueue;
  private ocel2State: Ocel2Log;
  
  constructor(queuePath: string) {
    this.queue = new DurableQueue(queuePath);
    this.ocel2State = {
      eventTypes: {
        "Mutation": { attributes: ["causality", "actor"] },
        "ReceiptDecision": { attributes: ["decision", "reason"] }
      },
      objectTypes: {
        "User": { attributes: ["role"] },
        "Order": { attributes: ["currency"] },
        "Session": { attributes: ["platform"] },
        "Receipt": { attributes: ["hash"] }
      },
      events: [], objects: [], "event-object": [], "object-object": [], objectChanges: []
    };
    
    // Register Global Objects
    this.ocel2State.objects.push({ "ocel:id": "USER_442", "ocel:type": "User", "ocel:attributes": { role: "Customer" } });
    this.ocel2State.objects.push({ "ocel:id": "APP_SESSION_991", "ocel:type": "Session", "ocel:attributes": { platform: "iOS" } });
    this.ocel2State.objects.push({ "ocel:id": "ORD_8841", "ocel:type": "Order", "ocel:attributes": { currency: "USD" } });
  }

  public getContextWrapper(initialState: any) {
    const causalityContext = createContext();
    const { proxy: state, defineSetInterceptor } = createProxy(initialState);
    let currentObservedIdx = 0;

    defineSetInterceptor((target: any, prop: string, newValue: any) => {
      const oldValue = target[prop];
      if (oldValue === newValue) return true;

      const currentAction = causalityContext.tryUse() || "Background Sync";
      const timestamp = new Date().toISOString();
      const evtId = `evt_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;

      // 1. Admission Control: Validate Checkout Transition
      if (prop === "checkoutStatus") {
        const expectedNext = EXPECTED_PATH[currentObservedIdx + 1];
        if (newValue !== expectedNext) {
          // RECEIPT REFUSED
          console.error(`\n❌ [ReceiptRefused] Illegal transition: ${oldValue} -> ${newValue}. Expected: ${expectedNext}`);
          this.emitRefusalEvent(evtId, timestamp, oldValue, newValue, currentAction);
          return true; // Block mutation but satisfy strict-mode Proxy traps
        }
        currentObservedIdx++;
      } else if (prop === "cartTotal") {
        currentObservedIdx = EXPECTED_PATH.indexOf("cart_updated");
      } else if (prop === "shippingAddress") {
        currentObservedIdx = EXPECTED_PATH.indexOf("address_added");
      }

      // 2. Build Event
      const evt = {
        "ocel:id": evtId,
        "ocel:type": "Mutation",
        "ocel:timestamp": timestamp,
        "ocel:attributes": { causality: currentAction, actor: "USER_442" }
      };

      // 3. Object Changes
      const changes = [
        { "ocel:object-id": "ORD_8841", "ocel:time": timestamp, "ocel:field": String(prop), "ocel:value": newValue }
      ];

      // 4. Qualified Relationships
      const rels = [
        { "ocel:event-id": evtId, "ocel:object-id": "USER_442", "ocel:qualifier": "initiated" },
        { "ocel:event-id": evtId, "ocel:object-id": "ORD_8841", "ocel:qualifier": "mutated" },
        { "ocel:event-id": evtId, "ocel:object-id": "APP_SESSION_991", "ocel:qualifier": "context" }
      ];

      this.queue.push(evt, changes, rels);
      target[prop] = newValue;
      console.log(`  [Admitted] ${String(prop)}: ${oldValue} -> ${newValue}`);
      return true;
    });

    return { state, causalityContext };
  }

  private emitRefusalEvent(evtId: string, timestamp: string, oldVal: string, newVal: string, action: string) {
    const evt = {
      "ocel:id": `${evtId}_refusal`,
      "ocel:type": "ReceiptDecision",
      "ocel:timestamp": timestamp,
      "ocel:attributes": { decision: "refused", reason: `illegal transition ${oldVal} -> ${newVal}` }
    };
    const rels = [
      { "ocel:event-id": `${evtId}_refusal`, "ocel:object-id": "ORD_8841", "ocel:qualifier": "refused_mutation" },
      { "ocel:event-id": `${evtId}_refusal`, "ocel:object-id": "USER_442", "ocel:qualifier": "initiated" }
    ];
    this.queue.push(evt, [], rels);
  }

  public async egress(sessionId: string, deviceId: string, runName: string) {
    console.log(`\n[Truex Egress: ${runName}] Draining durable local queue...`);
    const batch = this.queue.flush();
    if (batch.events.length === 0) return;

    this.ocel2State.events = batch.events;
    this.ocel2State.objectChanges = batch.objectChanges;
    this.ocel2State["event-object"] = batch.eventObjectRels;

    const hasRefusal = batch.events.some((e: any) => e["ocel:type"] === "ReceiptDecision");
    
    // Canonical Hashing
    const serializedBatch = canonicalStringify(this.ocel2State);
    const ocel2BatchHash = blake3Hash(serializedBatch).toString("hex");
    const receiptSeed = `${sessionId}:${ocel2BatchHash}:${EXPECTED_PATH_HASH}`;
    const receiptHash = blake3Hash(receiptSeed).toString("hex");

    const traceId = createHash("md5").update(Date.now().toString()).digest("hex");
    const spanId = traceId.substring(0, 16);

    const payload = {
      truex_profile: "truex.ocel2.receipt.v1",
      trace_id: traceId,
      span_id: spanId,
      session_id: sessionId,
      device_id: deviceId,
      admission_status: hasRefusal ? "ReceiptRefused" : "ReceiptAdmitted",
      expected_path_hash: EXPECTED_PATH_HASH,
      ocel2_batch_hash: ocel2BatchHash,
      receipt_hash: receiptHash,
      ocel2: this.ocel2State
    };

    const outDir = resolve(process.cwd(), "examples/out");
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    // Simulate OTLP Endpoint
    const endpoint = process.env.TRUEX_OTLP_ENDPOINT;
    if (endpoint) {
      console.log(`[Truex Egress] Sending OTLP JSON to ${endpoint}`);
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.log("  (OTLP Target unreachable, simulating success)");
      }
    } else {
      console.log("[Truex Egress] TRUEX_OTLP_ENDPOINT not set. Writing to disk...");
    }

    writeFileSync(resolve(outDir, `truex_ocel2_${runName}.json`), JSON.stringify(payload, null, 2));
    this.generateReplayArtifact(payload, runName, outDir);
  }

  private generateReplayArtifact(payload: any, runName: string, outDir: string) {
    const isAdmitted = payload.admission_status === "ReceiptAdmitted";
    let mermaid = `stateDiagram-v2\n  idle --> cart_updated\n  cart_updated --> address_added\n  address_added --> processing\n  processing --> paid\n\n`;
    
    if (!isAdmitted) {
      mermaid += `  idle --> paid : ❌ ILLEGAL\n`;
    }

    const md = `
# Truex Capture: App State to Admitted Execution Receipt
**Run**: ${runName}  
**Status**: \`${payload.admission_status}\`  
**Trace ID**: \`${payload.trace_id}\`  
**Receipt Hash**: \`${payload.receipt_hash}\`  

## Expected Path Constraints
Hash: \`${payload.expected_path_hash}\`

## State Diagram Replay
\`\`\`mermaid
${mermaid}
\`\`\`

## OTLP Payload Details
This payload was wrapped in a Truex envelope and egressed via OpenTelemetry.
    `;
    writeFileSync(resolve(outDir, `truex_replay_${runName}.md`), md);
    console.log(`[Success] Visual Replay Artifact generated: truex_replay_${runName}.md`);
  }
}

// --- EXECUTION ---
export async function runCaptureDemo() {
  const outDir = resolve(process.cwd(), "examples/out");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const queuePath = resolve(outDir, "local_db.json");
  if (existsSync(queuePath)) rmSync(queuePath);

  // RUN A: The Happy Path
  console.log("\n=======================================================");
  console.log(" RUN A: Valid Checkout Path");
  console.log("=======================================================");
  const captureA = new TruexCapture(queuePath);
  const { state: stateA, causalityContext: ctxA } = captureA.getContextWrapper({ checkoutStatus: "idle", cartTotal: 0, shippingAddress: null });

  ctxA.call("User tapped 'Add to Cart'", () => { stateA.cartTotal = 150; });
  ctxA.call("User entered Shipping Address", () => { stateA.shippingAddress = "123 Truex Lane"; });
  ctxA.call("User tapped 'Checkout'", () => { stateA.checkoutStatus = "processing"; });
  ctxA.call("Webhook: Payment Success", () => { stateA.checkoutStatus = "paid"; });
  
  await captureA.egress("APP_SESSION_991", "DEVICE_A22", "valid");

  // RUN B: The Fraudulent Path
  console.log("\n=======================================================");
  console.log(" RUN B: Fake/Invalid Checkout Closure");
  console.log("=======================================================");
  if (existsSync(queuePath)) rmSync(queuePath);
  const captureB = new TruexCapture(queuePath);
  const { state: stateB, causalityContext: ctxB } = captureB.getContextWrapper({ checkoutStatus: "idle", cartTotal: 0, shippingAddress: null });

  ctxB.call("User tapped 'Add to Cart'", () => { stateB.cartTotal = 150; });
  // Missing address added & missing processing! Try to jump straight to paid
  ctxB.call("Hacked API call", () => { stateB.checkoutStatus = "paid"; });

  await captureB.egress("APP_SESSION_991", "DEVICE_A22", "fraudulent");
}
