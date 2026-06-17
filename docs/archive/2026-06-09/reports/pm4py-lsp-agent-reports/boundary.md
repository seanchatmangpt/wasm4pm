# Boundary Agent Investigation Report

**Role**: Boundary Agent (`boundary`)  
**Milestone**: Milestone 1  
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
- A complete search confirms that no process-mining or `wasm4pm`-specific concepts exist in `vendors/tower-lsp-max/`. The crate remains a pure, domain-agnostic language server substrate.
- The `conformance` and `receipt` structures are abstract. They track generic `LawAxis` conformance and generate transaction receipt hashes, allowing domain-specific layers to extend them without contaminating the vendor code.

### Purity Rules:
- **No Domain Leakage**: All PM4Py, XES, OCEL, BPMN, Petri net, and POWL terms are strictly banned from `vendors/tower-lsp-max`.
- **Extension Namespace**: Domain constraints must be declared using `LawAxis::Custom(String)` and custom JSON-RPC commands.
- **Automated Purity Scans**: We recommend adding a CI scanner that rejects commits if any forbidden process-mining words are found in the vendor directory:
  ```bash
  ! rg -i -g "!target/" -g "!.git/" "(pm4py|xes|ocel|bpmn|petri|powl|fitness|precision|wasm4pm)" vendors/tower-lsp-max/
  ```

## 3. Durable Vendor Strategy
Currently, `vendors/tower-lsp-max` is listed in `.git/info/exclude`, which means its files are ignored locally by Git. This presents a critical portability risk because anyone cloning the repository will lack the source code for the path dependency, breaking the cargo build.

To resolve this and maintain vendor isolation, we establish the following durable vendor strategy:

### A. Repository Integration (Commit vs. Submodule)
1. **Option A: Direct Monorepo Vendoring (Recommended)**
   - Remove the local exclusion from `.git/info/exclude`.
   - Run `git add vendors/tower-lsp-max` to commit the vendor source code directly to the repository.
   - This guarantees that the project is completely self-contained and builds immediately on clone (portable CI/CD).
2. **Option B: Git Submodule**
   - Register the repository as a git submodule:
     ```bash
     git submodule add https://github.com/seanchatmangpt/tower-lsp-max.git vendors/tower-lsp-max
     ```
   - This maintains upstream reference tracking and keeps the monorepo history clean, though it requires developers to run `git submodule update --init --recursive`.

### B. Workspace Isolation
- We will keep `vendors/tower-lsp-max` excluded from the `members` array in the root `Cargo.toml`.
- This ensures that running standard commands like `cargo test` or `cargo build` in the monorepo root only compiles the vendor crate as a dependency and does not run its internal unit tests or build its standalone components, accelerating development workflows.

### C. Downstream Adaptation
- Any local fixes or features required in the LSP protocol itself must be made in a fully generic manner within `vendors/tower-lsp-max` and published as an agnostic release, ensuring no process-mining semantics ever enter the vendor substrate.
