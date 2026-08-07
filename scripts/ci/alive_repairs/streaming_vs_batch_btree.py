#!/usr/bin/env python3
"""Migrate streaming-vs-batch event constructors to the canonical BTreeMap.

The parity oracle still intentionally uses HashMap for unordered edge equality.
This constructor changes only the import shape and the two Event/Trace attribute
constructors denied by the all-target clippy checkpoint.
"""
from __future__ import annotations

from pathlib import Path


TARGET = Path("wasm4pm/benches/streaming_vs_batch.rs")
OLD_IMPORT = "use std::collections::HashMap;"
NEW_IMPORT = "use std::collections::{BTreeMap, HashMap};"
OLD_CONSTRUCTOR = "attributes: HashMap::new(),"
NEW_CONSTRUCTOR = "attributes: BTreeMap::new(),"
EXPECTED_CONSTRUCTORS = 2


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")
    import_count = source.count(OLD_IMPORT)
    constructor_count = source.count(OLD_CONSTRUCTOR)

    if import_count != 1 or constructor_count != EXPECTED_CONSTRUCTORS:
        raise SystemExit(
            "STREAMING_VS_BATCH_BTREE_ADMISSION_REFUSED "
            f"import_count={import_count} "
            f"constructor_count={constructor_count} "
            f"expected_constructors={EXPECTED_CONSTRUCTORS}"
        )
    if NEW_IMPORT in source or NEW_CONSTRUCTOR in source:
        raise SystemExit("STREAMING_VS_BATCH_BTREE_MIXED_STATE_REFUSED")

    repaired = source.replace(OLD_IMPORT, NEW_IMPORT).replace(
        OLD_CONSTRUCTOR, NEW_CONSTRUCTOR
    )

    if OLD_IMPORT in repaired or OLD_CONSTRUCTOR in repaired:
        raise SystemExit("STREAMING_VS_BATCH_BTREE_POSTCONDITION_REFUSED")
    if repaired.count(NEW_IMPORT) != 1:
        raise SystemExit("STREAMING_VS_BATCH_BTREE_IMPORT_CARDINALITY_REFUSED")
    if repaired.count(NEW_CONSTRUCTOR) != EXPECTED_CONSTRUCTORS:
        raise SystemExit("STREAMING_VS_BATCH_BTREE_CONSTRUCTOR_CARDINALITY_REFUSED")
    if repaired.count("HashMap<") < 1:
        raise SystemExit("STREAMING_VS_BATCH_PARITY_HASHMAP_PRESERVATION_REFUSED")

    TARGET.write_text(repaired, encoding="utf-8")
    print(TARGET)


if __name__ == "__main__":
    main()
