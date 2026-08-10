"""Read-only access to the 55-breed cognition registry.

Loads ``crates/wasm4pm-cognition/breeds/registry.json`` -- the same file the
Rust ``BreedId::ALL`` enum is generated from -- so the DSPy allowlist and the
deterministic admission gate can never drift from what the kernel actually
supports. This module never writes to the registry and never invokes ``dspy``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

__all__ = ["BreedRecord", "RegistryUnavailable", "load_registry", "breed_ids"]


class RegistryUnavailable(RuntimeError):
    """Raised when ``breeds/registry.json`` cannot be located or parsed."""


@dataclass(frozen=True)
class BreedRecord:
    breed_id: str
    breed_name: str
    historical_ancestor: str
    status: str
    standing: str


def _default_registry_path() -> Path:
    """``wasm4pm-dspy/`` sits directly under the wasm4pm repo root (per its own
    package layout: ``~/wasm4pm/wasm4pm-dspy``), so the registry is always two
    path segments away -- no sibling-repo env var needed, unlike
    ``autofde_lab.receipts.wasm4pm_cognition`` which crosses a repo boundary."""
    return (
        Path(__file__).resolve().parents[3]
        / "crates"
        / "wasm4pm-cognition"
        / "breeds"
        / "registry.json"
    )


def load_registry(path: Path | None = None) -> list[BreedRecord]:
    """Load and parse the real breed registry. Raises :class:`RegistryUnavailable`
    on any missing file or shape mismatch -- never returns a partial/default list."""
    registry_path = path or _default_registry_path()
    try:
        raw = json.loads(registry_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RegistryUnavailable(
            f"breed registry not found at {registry_path} -- expected "
            "crates/wasm4pm-cognition/breeds/registry.json relative to the repo root"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RegistryUnavailable(f"breed registry at {registry_path} is not valid JSON") from exc

    if not isinstance(raw, list):
        raise RegistryUnavailable(f"breed registry at {registry_path} must be a JSON array")

    records = []
    for entry in raw:
        try:
            records.append(
                BreedRecord(
                    breed_id=entry["breed_id"],
                    breed_name=entry["breed_name"],
                    historical_ancestor=entry.get("historical_ancestor", ""),
                    status=entry.get("status", ""),
                    standing=entry.get("standing", ""),
                )
            )
        except KeyError as exc:
            raise RegistryUnavailable(
                f"breed registry entry missing required field {exc}: {entry!r}"
            ) from exc

    if not records:
        raise RegistryUnavailable(f"breed registry at {registry_path} parsed to zero breeds")

    return records


def breed_ids(records: list[BreedRecord] | None = None) -> frozenset[str]:
    """Convenience: the bare set of valid ``breed_id`` strings."""
    return frozenset(r.breed_id for r in (records or load_registry()))
