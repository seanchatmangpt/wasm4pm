#!/usr/bin/env python3
"""Fail when a tracked Git path cannot be represented on Windows."""

from __future__ import annotations

import json
import re
import subprocess

INVALID_CHARS = re.compile(r'[<>:"\\|?*]')
RESERVED = re.compile(r'^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$', re.IGNORECASE)


def main() -> int:
    raw = subprocess.check_output(["git", "ls-files", "-z"])
    invalid: list[dict[str, str]] = []
    for item in raw.split(b"\0"):
        if not item:
            continue
        path = item.decode("utf-8", errors="strict")
        for segment in path.split("/"):
            reason = None
            if INVALID_CHARS.search(segment):
                reason = "invalid_character"
            elif segment.endswith((".", " ")):
                reason = "trailing_dot_or_space"
            elif RESERVED.match(segment):
                reason = "reserved_device_name"
            if reason:
                invalid.append({"path": path, "segment": segment, "reason": reason})
                break

    print(json.dumps({
        "schema": "wasm4pm.windows-path-gate/v1",
        "invalid_count": len(invalid),
        "invalid": invalid,
    }, indent=2, sort_keys=True))
    return 2 if invalid else 0


if __name__ == "__main__":
    raise SystemExit(main())
