from collections.abc import Iterable
from typing import TypeVar

Key = TypeVar("Key", bound=object)
Value = TypeVar("Value")


def build_lookup(entries: Iterable[tuple[Key, Value]]) -> dict[Key, Value]:
    """Build a direct lookup table; later duplicate keys replace earlier values."""
    lookup: dict[Key, Value] = {}
    for key, value in entries:
        lookup[key] = value
    return lookup


def lookup_or_none(lookup: dict[Key, Value], key: Key) -> Value | None:
    """Return the value for key without raising when the key is absent."""
    return lookup.get(key)
