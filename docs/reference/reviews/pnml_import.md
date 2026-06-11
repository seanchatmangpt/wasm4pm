# Algorithm Review: pnml_import

## Algorithm ID & Domain
- **Algorithm ID**: `pnml_import`
- **Domain**: Process Mining / Input-Output (PNML XML to PetriNet Parsing)

## Correctness Audit
- **XML Parsing Robustness**:
  - The parser implements a SAX-style two-pass parser using the `quick-xml` crate. Pass 1 handles SAX events (`Event::Start`, `Event::Empty`, `Event::Text`, `Event::End`, `Event::Eof`) and updates a state machine (`ParseState`).
  - If a required `<net>` element is missing from the document, it returns an error: `Err("PNML: missing <net> element".to_string())` (lines 469-471).
  - Malformed XML is captured via quick-xml errors and returned as an error string: `Err(format!("Failed to parse PNML XML: {}", e))` (line 463).
- **Attribute Parsing**:
  - The `attr_value` helper (lines 524-533) safely iterates over XML attributes. If UTF-8 conversion fails, it returns `None` rather than panicking.
  - `parse_usize` uses `s.trim().parse::<usize>().ok()` (lines 26-28), which safely handles integer parsing and returns `None` on empty or invalid text.
- **Silent Transition Semantics**:
  - A transition is marked silent (`is_invisible = Some(true)`) if it has a toolspecific activity attribute equal to `"$invisible$"`, if it has no name attribute and no child `<name>`, or if its label is empty (lines 495-500). This aligns with standard PNML representations of silent steps.
- **XML Escaping**:
  - The `escape_xml` helper (lines 642-655) escapes standard XML entities (`&`, `<`, `>`, `"`, `'`), ensuring that serialized Petri Net labels are valid XML.

## Improvement Areas
- **SAX State Machine Overhead**:
  - The state machine in Pass 1 is represented as a nested enum `ParseState` (lines 36-74). String contents are collected by setting the state and then capturing `Event::Text` events. While SAX parsing is highly memory-efficient, this state machine requires very careful maintenance when extending the XML tag support.
- **Allocation Optimization**:
  - In Pass 2, raw SAX structures (`PlaceData`, `TransitionData`) are converted into the final `PetriNet` places and transitions. This copies the parsed strings. Because the final `PetriNet` struct owns its data, this copy is expected, but some intermediate allocations (like `cur_place_id`, `cur_trans_id`) could be optimized.

## Code References
- **Rust Implementation**: `wasm4pm/src/pnml_io.rs` (method: `from_pnml` / `from_pnml_wasm`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `pnml_import`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
