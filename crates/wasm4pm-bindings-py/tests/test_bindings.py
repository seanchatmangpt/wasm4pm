"""Validation tests for wasm4pm Python bindings."""

import json
from pathlib import Path

import pytest

import wasm4pm

FIXTURES = Path(__file__).resolve().parents[3] / "wasm4pm" / "tests" / "fixtures"
NEGATIVE = Path(__file__).resolve().parents[3] / "fixtures" / "negative"

ORDER_TO_CASH = """
{
  "eventTypes": [{"name": "place_order"}, {"name": "ship"}],
  "objectTypes": [{"name": "Order"}, {"name": "Customer"}],
  "objects": [
    {"id": "c1", "type": "Customer", "attributes": [], "relationships": []},
    {"id": "o1", "type": "Order", "attributes": [], "relationships": [{"objectId": "c1", "qualifier": "placed_by"}]}
  ],
  "events": [
    {"id": "ev1", "type": "place_order", "time": "2024-01-02T09:00:00Z", "attributes": [],
     "relationships": [{"objectId": "o1", "qualifier": "order"}, {"objectId": "c1", "qualifier": "customer"}]},
    {"id": "ev2", "type": "ship", "time": "2024-01-03T10:00:00Z", "attributes": [],
     "relationships": [{"objectId": "o1", "qualifier": "order"}]}
  ]
}
"""


def test_version():
    assert wasm4pm.version()
    assert wasm4pm.__version__


def test_load_ocel_v2():
    loaded = wasm4pm.load_ocel_v2(ORDER_TO_CASH)
    assert isinstance(loaded, dict)
    assert "events" in loaded
    assert len(loaded["events"]) == 2


def test_flatten_ocel_v2():
    flat = wasm4pm.flatten_ocel_v2(ORDER_TO_CASH, "Order")
    assert flat["object_type"] == "Order"
    assert len(flat["cases"]) == 1
    assert flat["cases"][0]["trace"] == ["place_order", "ship"]


def test_flatten_ocel_v2_unknown_type():
    with pytest.raises(ValueError, match="not found"):
        wasm4pm.flatten_ocel_v2(ORDER_TO_CASH, "Nope")


def test_load_ocel_v2_malformed():
    with pytest.raises(ValueError):
        wasm4pm.load_ocel_v2("{ not json")


def test_validate_ocel_v2_accepts_lawful_log():
    report = wasm4pm.validate_ocel_v2(ORDER_TO_CASH)
    assert report["valid"] is True
    assert report["errors"] == []


def test_validate_ocel_v2_with_cardinality():
    card = json.dumps({"Order": {"min_count": 1, "max_count": 1}})
    report = wasm4pm.validate_ocel_v2(ORDER_TO_CASH, card)
    assert report["valid"] is True


def test_validate_ocel_v2_rejects_e2o_empty():
    raw = (NEGATIVE / "n12-e2o-empty.ocel.json").read_text(encoding="utf-8")
    report = wasm4pm.validate_ocel_v2(raw)
    assert report["valid"] is False
    codes = {err["code"] for err in report["errors"]}
    assert "E2O_EMPTY" in codes


def test_validate_ocel_v2_rejects_bad_cardinality_json():
    with pytest.raises(ValueError, match="cardinality"):
        wasm4pm.validate_ocel_v2(ORDER_TO_CASH, "{ not json")


def test_parse_powl():
    parsed = wasm4pm.parse_powl("X (A, B)")
    assert parsed["node_count"] >= 1
    assert "repr" in parsed


def test_validate_partial_orders_valid():
    result = wasm4pm.validate_partial_orders("X (A, B)")
    assert result["valid"] is True


def test_discover_powl_from_log():
    running_example = (FIXTURES / "running-example.json").read_text(encoding="utf-8")
    discovered = wasm4pm.discover_powl_from_log(running_example)
    assert "repr" in discovered
    assert discovered["node_count"] >= 1


def test_powl_execute():
    model = "X (A, B)"
    result = wasm4pm.powl_execute(model)
    assert "receipt" in result or "ocel" in result


def test_list_exports():
    exports = wasm4pm.list_exports()
    assert isinstance(exports, list)
    assert len(exports) >= 300
    assert "discover_dfg" in exports
    assert "get_capabilities" in exports


def test_get_capabilities():
    caps = wasm4pm.get_capabilities()
    assert isinstance(caps, dict)


def test_invoke_version():
    ver = wasm4pm.invoke("get_version", [])
    assert isinstance(ver, str)
    assert ver


def test_session_and_dfg():
    running_example = (FIXTURES / "running-example.json").read_text(encoding="utf-8")
    handle = wasm4pm.load_eventlog_from_json(running_example)
    assert isinstance(handle, str)
    assert wasm4pm.object_count() >= 1

    dfg = wasm4pm.invoke("discover_dfg", [handle, "concept:name"])
    assert isinstance(dfg, dict)

    exported = wasm4pm.export_eventlog_to_json(handle)
    assert "traces" in exported

    wasm4pm.delete_object(handle)
    wasm4pm.clear_all_objects()


def test_list_algorithms():
    algorithms = wasm4pm.list_algorithms()
    assert "dfg" in algorithms
    assert "ilp" in algorithms


def test_run_algorithm_dfg():
    running_example = (FIXTURES / "running-example.json").read_text(encoding="utf-8")
    handle = wasm4pm.load_eventlog_from_json(running_example)
    result = wasm4pm.run_algorithm("dfg", handle, "concept:name")
    assert isinstance(result, dict)
    wasm4pm.clear_all_objects()
