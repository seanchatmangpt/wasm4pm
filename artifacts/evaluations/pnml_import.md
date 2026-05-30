# Algorithm Evaluation: pnml_import

## Metadata
- **Algorithm ID:** `pnml_import`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Interface Status
- **Registry Entry:** ✅ Present
- **TypeScript Dispatch:** ✅ Present
- **CLI Surface:** ✅ Present
- **WASM Export:** ✅ Present

## Behavioral Evidence
- **Positive Cases:** 1/1 passed
- **Negative Cases:** 2/2 failed correctly
- **Invariant Cases:** 1/1 passed

## Verification
- **Evidence Hash:** `85b3e150f79adb84e62575c185e25f70a164b61f156545814a8520c135101b56`
- **State:** `Closed`

## Algorithmic Role
Supports the importation of Petri net models defined in the standard Petri Net Markup Language (PNML). This ensures seamless interoperability with a wide range of process modeling and analysis tools that utilize the PNML standard, facilitating the reuse of existing process assets within the wasm4pm ecosystem.

## Implementation Validation & Details
Based on the source code in `wasm4pm/src/pnml_io.rs`:
- Implements robust parsing of the PNML XML standard using the `roxmltree` library.
- Extracts process graph structures from `<place>`, `<transition>`, and `<arc>` nodes spanning potentially multiple `<page>` elements.
- Handles `<initialMarking>` and `<finalmarkings>` to reconstruct the state configuration.
- Accurately captures transition labels from `<name><text>` tags or `name` attributes, and correctly deduces invisible (silent) transitions when labels are absent. Arc weights are mapped from `<inscription><text>`.