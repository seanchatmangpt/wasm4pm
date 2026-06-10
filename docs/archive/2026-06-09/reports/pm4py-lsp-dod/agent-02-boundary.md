# Boundary Agent Investigation Report

**Role**: Boundary Agent (`boundary`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` Crate Purity & Boundary Architecture

## 1. Boundary Interfaces
The `pm4py-lsp` adapter operates across four primary system boundaries:
1. **LSP Client Boundary (JSON-RPC)**: Exposes standard LSP capabilities and custom `max/*` RPC methods to IDE clients.
2. **LSP-to-Python Boundary (Pyo3)**: Invokes the local python execution environment (pandas and pm4py) to perform dataframe checks and discovery tasks.
3. **LSP-to-Disk Boundary (Receipts & Snapshots)**: Writes cryptographic receipts to `receipts/pm4py-lsp/` and exports parity fixtures to `fixtures/pm4py-parity/` bound to deterministic snapshot hashes.
4. **WASM Replay Boundary**: The exported parity fixtures represent a clean, serialized contract that the `wasm4pm` compiler and CLI consume to run identical process mining validations inside WASM.

## 2. Crate Purity Verification & Purity Fence
We verified the isolation of the vendor crate `vendors/tower-lsp-max`. 

### Purity Findings:
- No process-mining or `wasm4pm`-specific concepts exist in `vendors/tower-lsp-max/`. The crate remains a pure, domain-agnostic language server substrate.
- The `conformance` and `receipt` structures are abstract. They track generic `LawAxis` conformance and generate transaction receipt hashes, allowing domain-specific layers to extend them without contaminating the vendor code.

### Purity Rules:
- **No Domain Leakage**: All PM4Py, XES, OCEL, BPMN, Petri net, and POWL terms are strictly banned from `vendors/tower-lsp-max`.
- **Extension Namespace**: Domain constraints must be declared using `LawAxis::Custom(String)` and custom JSON-RPC commands.
