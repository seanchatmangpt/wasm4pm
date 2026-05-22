# Truex: Jobs-To-Be-Done (JTBD)

Truex serves as the cryptographic trust layer for Object-Centric Process Science. It is hired by specific personas to solve exact systemic friction points in process evidence generation, verification, and ingestion.

---

## 1. The Edge Developer's Job

**The Job:** 
> "Help me generate compliant enterprise process-mining evidence without forcing me to learn process-mining math, deal with invasive backend logging SDKs, or break my mobile app's main thread."

**The Truex Solution (`Truex Capture`):**
Truex provides zero-config Proxy wrappers (via `proxyable`) that natively intercept React Native / Expo application state. Developers do not need to construct complex flat-logs. Truex automatically captures object mutations, links causal relationships, and handles the asynchronous OpenTelemetry egress.

---

## 2. The Compliance Officer's Job

**The Job:** 
> "Help me cryptographically prove that this executed business process actually followed our mandatory regulatory path, and guarantee that the telemetry wasn't forged or tampered with after the fact."

**The Truex Solution (`Truex Canonicalization & Receipt Profile`):**
Because Truex uses strict OCEL 2.0 canonicalization combined with state-machine admission control, it can reject illegal process transitions (e.g., jumping from `idle` straight to `paid`). The compliance officer receives an *Admitted Execution Receipt* signed by a cryptographic batch hash. The process isn't just observed—it's proven valid.

---

## 3. The Data / System Engineer's Job

**The Job:** 
> "Help me securely ingest edge telemetry into my warehouse (like Celonis or Splunk) without losing the complex Object-Centric relationships or having to stand up an entirely new proprietary logging gateway."

**The Truex Solution (`Truex OTLP Egress Envelope`):**
Truex treats OpenTelemetry as its delivery fabric. The strict OCEL 2.0 object (with its event-object edges) is wrapped in a Truex profile envelope and shipped via standard OTLP/HTTP. Data engineers can use their existing OTel Collectors to route the payload directly to object-centric warehouses without mangling the graph data.
