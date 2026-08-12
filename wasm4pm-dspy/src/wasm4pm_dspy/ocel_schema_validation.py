"""Real OCEL 2.0 JSON Schema validation for wasm4pm-dspy.

Independent, wasm4pm-dspy-side equivalent of `gymact.ocel.validate_ocel_log`:
a real `jsonschema.validate(instance=log, schema=_load_schema(),
format_checker=jsonschema.FormatChecker())` call against a real vendored copy
of the official OCEL 2.0 JSON Schema (`schemas/ocel20-schema.json`, vendored
from https://www.ocel-standard.org/2.0/ocel20-schema-json.json and
cross-referenced against ~/gymact/src/gymact/schemas/ocel20-schema.json).

No mocking: a genuinely malformed OCEL log must produce real, non-empty
`jsonschema` error messages here, not a rubber-stamped pass.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema

_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas" / "ocel20-schema.json"


@dataclass(frozen=True)
class SchemaValidationResult:
    is_valid: bool
    errors: tuple[str, ...]
    source_path: str


def _load_schema() -> dict[str, Any]:
    return json.loads(_SCHEMA_PATH.read_text())


def validate_ocel_schema(ocel_path: Path) -> SchemaValidationResult:
    """Validate the OCEL 2.0 JSON log at `ocel_path` against the vendored schema.

    Never raises for a normal validation failure (missing required field,
    wrong type, additional properties, etc.) -- those are caught and
    reported in `errors` with `is_valid=False`. Only genuine I/O or JSON
    parse failures propagate, since those indicate a caller error (bad
    path, corrupt file) rather than a schema-conformance finding.
    """
    source_path = str(ocel_path)
    log = json.loads(Path(ocel_path).read_text())
    schema = _load_schema()

    try:
        validator_cls = jsonschema.validators.validator_for(schema)
        validator_cls.check_schema(schema)
        validator = validator_cls(schema, format_checker=jsonschema.FormatChecker())
        errors = tuple(
            str(error.message)
            for error in sorted(validator.iter_errors(log), key=lambda e: e.path)
        )
    except jsonschema.exceptions.SchemaError as exc:
        return SchemaValidationResult(
            is_valid=False,
            errors=(str(exc.message),),
            source_path=source_path,
        )

    if errors:
        return SchemaValidationResult(
            is_valid=False,
            errors=errors,
            source_path=source_path,
        )

    return SchemaValidationResult(is_valid=True, errors=(), source_path=source_path)
