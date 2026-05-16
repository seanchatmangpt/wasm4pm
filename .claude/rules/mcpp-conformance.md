# MCPP Route Conformance Doctrine

For **MCPP**, conformance is not “model quality.” It is **route legality**.

```text
0.8 conformance = 20% of the declared route was not proven.
20% unproven route = unknown motion.
Unknown motion = stop the line.
```

## The Rules of Admission

`0.8` is acceptable only for **exploratory diagnostics**, not for admission.

| Context                       | Threshold | Meaning                             |
| ----------------------------- | --------: | ----------------------------------- |
| Exploration / route discovery |     ≥ 0.8 | Useful candidate signal             |
| Local debugging               |     ≥ 0.8 | Candidate route is worth inspecting |
| Manufacturing route admission |   **1.0** | Required                            |
| Receipt chain verification    |   **1.0** | Required                            |
| Published `.part.wasm`        |   **1.0** | Required                            |
| Framework adapter publication |   **1.0** | Required                            |
| Blue River proxy call         |   **1.0** | Required                            |

### Formal Definition

**0.8 may suggest the route is discoverable. 1.0 is required for the route to be admitted.**

OCEL replay must return 1.0 conformance for all required route obligations. Any value below 1.0 raises an **AndonPull** and blocks admission.

```text
Conformance(route_run) = 1.0
∧ Precision(route_run) = 1.0
∧ ReceiptCoverage(route_run) = 1.0
∧ RequiredStageCoverage(route_run) = 1.0
∧ ObjectLifecycleValidity(route_run) = 1.0
```

Otherwise:
```text
status = refused
refusal = AndonPull(RouteConformanceGap)
```

## Enforcement Directives

1. **`mcpp ocel replay --global`**  
   Must fail nonzero unless perfect. A failed run outputs:
   ```json
   {
     "status": "andon_pull",
     "refusal": "RouteConformanceGap",
     "conformance": 0.8,
     "message": "Route run is not admissible: conformance must equal 1.0"
   }
   ```

2. **`mcpp doctor check conformance`**  
   Doctor owns the interpretation. Example: `mcpp doctor check conformance --route wrap-tool-to-part --run extract_claims`
   If anything is below `1.0`:
   - Doctor raises AndonPull.
   - Robot cannot admit.
   - Receipt records refusal.

3. **General Principle:**  
   **Conformance is not a grade. Conformance is a fit gauge.**
   A part either fits or it does not. A route either replayed lawfully or it did not. A receipt chain either covers the consequence or it does not.
   *0.999 is still an Andon pull. Because the missing 0.001 is exactly where the defect hides.*

**For MCPP, `0.8` conformance is a diagnostic signal, not an acceptance threshold. Admission requires `1.0`. Anything less is an Andon pull, typed refusal, blocked route, and receipt-bound defect.**