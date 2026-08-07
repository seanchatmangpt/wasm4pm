#!/usr/bin/env python3
"""Migrate the scalability benchmark to the canonical ordered event-map type.

The production Event/Trace model uses BTreeMap. This constructor is fail-closed:
it changes only the one import and six stale HashMap constructors observed by
the all-target clippy checkpoint.
"""
from __future__ import annotations

from pathlib import Path


TARGET = Path("wasm4pm/benches/scalability_benchmark.rs")
OLD_IMPORT = "use std::collections::HashMap;"
NEW_IMPORT = "use std::collections::BTreeMap;"
OLD_CONSTRUCTOR = "HashMap::new()"
NEW_CONSTRUCTOR = "BTreeMap::new()"
EXPECTED_CONSTRUCTORS = 6


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")
    import_count = source.count(OLD_IMPORT)
    constructor_count = source.count(OLD_CONSTRUCTOR)

    if import_count != 1 or constructor_count != EXPECTED_CONSTRUCTORS:
        raise SystemExit(
            "SCALABILITY_BTREE_ADMISSION_REFUSED "
            f"import_count={import_count} "
            f"constructor_count={constructor_count} "
            f"expected_constructors={EXPECTED_CONSTRUCTORS}"
        )
    if NEW_IMPORT in source or NEW_CONSTRUCTOR in source:
        raise SystemExit("SCALABILITY_BTREE_MIXED_STATE_REFUSED")

    repaired = source.replace(OLD_IMPORT, NEW_IMPORT).replace(
        OLD_CONSTRUCTOR, NEW_CONSTRUCTOR
    )

    if OLD_IMPORT in repaired or OLD_CONSTRUCTOR in repaired:
        raise SystemExit("SCALABILITY_BTREE_POSTCONDITION_REFUSED")
    if repaired.count(NEW_IMPORT) != 1:
        raise SystemExit("SCALABILITY_BTREE_IMPORT_CARDINALITY_REFUSED")
    if repaired.count(NEW_CONSTRUCTOR) != EXPECTED_CONSTRUCTORS:
        raise SystemExit("SCALABILITY_BTREE_CONSTRUCTOR_CARDINALITY_REFUSED")

    TARGET.write_text(repaired, encoding="utf-8")
    print(TARGET)


if __name__ == "__main__":
    main()
