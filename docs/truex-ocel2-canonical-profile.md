# Truex OCEL 2.0 Canonicalization & Receipt Profile

## 1. Introduction
The Open-Centric Event Log (OCEL) 2.0 standard defines the grammatical structure of object-centric process mining data. However, the standard allows for varying degrees of flexibility in serialization, array ordering, and key arrangement. This structural flexibility prevents the direct cryptographic binding of process evidence, as identical semantic datasets can yield wildly different hashes.

The **Truex OCEL 2.0 Canonicalization & Receipt Profile** enforces a strict mathematical layer over standard OCEL 2.0 formats. By defining a deterministic, cross-format serialization protocol, Truex enables systems to generate unforgeable **Admitted Execution Receipts**.

## 2. Canonicalization Rules (The JCS-OCEL Protocol)

To compute the `ocel2_batch_hash`, an OCEL 2.0 JSON payload MUST be subjected to the following normalization transformations before BLAKE3 hashing.

### 2.1 Timestamp Normalization
All timestamps (`ocel:time`, `ocel:timestamp`) must conform to the ISO 8601 format, forced strictly into the UTC timezone (identified by the `Z` suffix).
- Valid: `2026-05-22T04:23:46.662Z`
- Invalid: `2026-05-22T04:23:46.662+00:00`

### 2.2 Key Lexicographical Sorting
Within any JSON object, keys MUST be sorted alphabetically based on their UTF-16 code units.
```json
// INVALID
{"ocel:type": "Order", "ocel:id": "ORD_1"}

// CANONICAL
{"ocel:id": "ORD_1", "ocel:type": "Order"}
```

### 2.3 Deterministic Array Ordering
Arrays lacking intrinsic mathematical order in the JSON spec must be sorted ascendingly based on composite string serialization.

For `events`: sorted alphabetically by `ocel:id`.
For `objects`: sorted alphabetically by `ocel:id`.
For `event-object`: sorted by composite string `ocel:event-id|ocel:object-id|ocel:qualifier`.
For `objectChanges`: sorted by composite string `ocel:object-id|ocel:time|ocel:field`.

### 2.4 Null and Whitespace Truncation
- Trailing whitespaces and pretty-print formatting (newlines, indents) MUST be stripped.
- Explicit `null` properties should be retained if they carry semantic weight (e.g. `previousValue: null`), but empty arrays `[]` representing missing data blocks should be pruned prior to serialization if allowed by schema.

## 3. The Truex Receipt Envelope Schema

The egress system MUST wrap the canonicalized `ocel2` payload inside the Truex Receipt Envelope.

```json
{
  "truex_profile": "truex.ocel2.receipt.v1",
  "trace_id": "<w3c-trace-id>",
  "span_id": "<w3c-span-id>",
  "session_id": "<application-session-id>",
  "device_id": "<device-identifier>",
  "admission_status": "ReceiptAdmitted | ReceiptForged | ReceiptLaundered | BoundaryMissing | SummaryOnlyProof | CanonicalizationMismatch | ReplayDetected | InvalidTransition | IncompletePath | VerifierMismatch",
  "equivalence_class": "EquivalentUnderProfileV1",
  "expected_path_hash": "<blake3-of-expected-transition-graph>",
  "ocel2_batch_hash": "<blake3-of-canonical-ocel2-object>",
  "receipt_hash": "<blake3-of-admission-signature>",
  "ocel2": {
    "eventTypes": {},
    "objectTypes": {},
    "events": [],
    "objects": [],
    "event-object": [],
    "object-object": [],
    "objectChanges": []
  }
}
```

### 3.1 Hash Derivations
- `ocel2_batch_hash`: `BLAKE3(CanonicalStringify(envelope.ocel2))`
- `receipt_hash`: `BLAKE3(session_id + ":" + ocel2_batch_hash + ":" + expected_path_hash)`

## 4. Verification Workflow

A Truex Verifier (e.g. `wpm truex verify`) MUST execute the following pipeline upon receipt of a Truex Envelope:
1. Extract the inner `ocel2` payload.
2. Apply Canonicalization Rules (2.1 - 2.4).
3. Compute `H1 = BLAKE3(CanonicalPayload)`.
4. Assert `H1 == envelope.ocel2_batch_hash`.
5. Compute `H2 = BLAKE3(session_id:H1:expected_path_hash)`.
6. Assert `H2 == envelope.receipt_hash`.

If any assertion fails, the receipt is immediately classified with a strict taxonomy error (e.g., **ReceiptForged** or **CanonicalizationMismatch**). If all assertions pass, the payload is given the **ReceiptAdmitted** status and bound to the **EquivalentUnderProfileV1** semantic equivalence class.
