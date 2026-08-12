"""Chicago-style: real source parse of the real capability_registry.rs (no
fixture -- it's real source already in the repo), real compute_coverage()
call, real assertions on real returned state. No mocking."""

from __future__ import annotations

from wasm4pm_dspy.capability_coverage import (
    CapabilityCoverageReport,
    compute_coverage,
    parse_capability_registry_source,
)

# Hand-counted directly from reading capability_registry.rs in full this
# session: discovery=7, conformance=3, analysis=5, data_quality=4,
# feature_extraction=3, filtering=3, io=4, state=3 -> 32 total.
_EXPECTED_BY_CATEGORY = {
    "discovery": 7,
    "conformance": 3,
    "analysis": 5,
    "data_quality": 4,
    "feature_extraction": 3,
    "filtering": 3,
    "io": 4,
    "state": 3,
}
_EXPECTED_TOTAL = sum(_EXPECTED_BY_CATEGORY.values())


def test_parse_capability_registry_source_matches_hand_count() -> None:
    registry = parse_capability_registry_source()

    assert set(registry) == set(_EXPECTED_BY_CATEGORY)
    for category, expected_count in _EXPECTED_BY_CATEGORY.items():
        assert len(registry[category]) == expected_count, (
            f"category {category!r}: expected {expected_count} functions, "
            f"got {len(registry[category])}: {registry[category]}"
        )

    total = sum(len(names) for names in registry.values())
    assert total == _EXPECTED_TOTAL == 32


def test_compute_coverage_total_and_by_category() -> None:
    report = compute_coverage()

    assert isinstance(report, CapabilityCoverageReport)
    assert report.total_capabilities == _EXPECTED_TOTAL
    assert report.by_category == _EXPECTED_BY_CATEGORY
    assert set(report.by_category) == {
        "discovery",
        "conformance",
        "analysis",
        "data_quality",
        "feature_extraction",
        "filtering",
        "io",
        "state",
    }


def test_exercised_capabilities_are_real_registry_members() -> None:
    """Every exercised capability must really appear in the real registry --
    no fabricated 'exercised' entries."""
    registry = parse_capability_registry_source()
    all_real_names = {name for names in registry.values() for name in names}

    report = compute_coverage()

    assert len(report.exercised_capabilities) > 0
    for name in report.exercised_capabilities:
        assert name in all_real_names, (
            f"{name!r} claimed as exercised but is not a real registry member"
        )

    # The one real, hand-verified match this session's audit found:
    # gymact_bridge.py's native path literally calls
    # `native.discover_ocel_dfg(log_handle)`.
    assert "discover_ocel_dfg" in report.exercised_capabilities


def test_exercised_and_unexercised_partition_all_capabilities() -> None:
    report = compute_coverage()

    assert len(report.exercised_capabilities) + len(report.unexercised_capabilities) == (
        report.total_capabilities
    )
    assert set(report.exercised_capabilities).isdisjoint(set(report.unexercised_capabilities))


def test_discover_oc_petri_net_is_not_fabricated_as_exercised() -> None:
    """gymact_bridge.py also calls `native.discover_oc_petri_net(...)` for a
    different algorithm branch, but no such function exists in the real
    registry -- it must never show up as 'exercised' (that would be a
    fabricated match)."""
    report = compute_coverage()

    assert "discover_oc_petri_net" not in report.exercised_capabilities
    assert "discover_oc_petri_net" not in report.unexercised_capabilities
