# API Truth Inventory: wasm4pm-compat v26.6.5

This document maps conceptual process-mining needs to the actual exported symbols in the `wasm4pm-compat` v26.6.5 crate.

| Conceptual Need | Actual Compat Symbol | Module / Location |
| :--- | :--- | :--- |
| **Evidence lifecycle carrier** | `Evidence<T, State, W>` | `wasm4pm_compat::evidence` |
| **Lifecycle states** | `Raw`, `Parsed`, `Admitted`, `Projected`, `Exportable`, `Receipted`, `Refused` | `wasm4pm_compat::state` |
| **Witness trait/markers** | `Witness` trait; Markers: `Ocel20`, `Xes1849`, `PowlPaper`, `WfNetSoundnessPaper`, etc. | `wasm4pm_compat::witness`, `wasm4pm_compat::witnesses` |
| **OCEL witness/type surface** | `Ocel20` (witness); `OcelAttributeValue`, `OcelAttribute`, `OcelObject`, `OcelEvent` | `wasm4pm_compat::ocel` |
| **XES witness/type surface** | `Xes1849` (witness); `XesAttributeValue`, `XesAttribute`, `XesEvent`, `XesTrace`, `XesLog` | `wasm4pm_compat::xes` |
| **Event log structural surface** | `Event`, `Trace`, `EventLog` | `wasm4pm_compat::eventlog` |
| **OCEL structural surface** | `OcelLog`, `EventObjectLink`, `ObjectObjectLink`, `ObjectChange` | `wasm4pm_compat::ocel` |
| **Petri/WF-net structural surface** | `PetriNet`, `WfNet`, `WfNetConst<SOUNDNESS>` | `wasm4pm_compat::petri` |
| **Process tree surface** | `ProcessTree`, `ProcessTreeNode`, `ProcessTreeOperator` | `wasm4pm_compat::process_tree` |
| **POWL surface** | `PowlNode`, `Powl8Op` | `wasm4pm_compat::powl`, `wasm4pm_compat::powl8_op` |
| **Declare surface** | `DeclareConstraint`, `DeclareTemplate`, `DeclareScope` | `wasm4pm_compat::declare` |
| **DFG surface** | `DirectlyFollowsGraph`, `DfgMiner` | `wasm4pm_compat::dfg` |
| **Refusal type/law surface** | `Refusal<R, W>`, `Admit` trait | `wasm4pm_compat::admission` |
| **Loss policy surface** | `LossPolicy`, `LossReport<From, To, Items>`, `LossChain` | `wasm4pm_compat::loss` |
| **Projection surface** | `ProjectionName`, `NamedLoss`, `NamedLossConst`, `ProjectionBoundary` | `wasm4pm_compat::loss` |
| **Receipt surface** | `ReceiptShape`, `ReceiptEnvelope`, `ReceiptChain`, `ReceiptChainConst<N>` | `wasm4pm_compat::receipt` |
| **Graduation surface** | `GraduationCandidate`, `GraduationReason`, `GraduateToWasm4pm` (trait) | `wasm4pm_compat::engine_bridge` |
