#!/usr/bin/env python3
"""Fail-closed verifier for the sealed wasm4pm-u8-part artifact.

The bounded claim is intentionally narrow:
- no custom sections survive sealing;
- no data payload is compiled into the part;
- all textual names are therefore import/export names;
- the admitted host import is `chatman.construct`;
- the `run` export exists;
- the `run` function body contains no block/loop/if/br/br_if/br_table or
  indirect-call instruction.

This is artifact evidence only. It does not prove the host's OCEL, BLAKE3,
signature, or corpus-standing checks.
"""

from __future__ import annotations

import argparse
import pathlib

MAGIC_AND_VERSION = b"\x00asm\x01\x00\x00\x00"
BRANCH_OPS = {
    0x02: "block",
    0x03: "loop",
    0x04: "if",
    0x05: "else",
    0x0C: "br",
    0x0D: "br_if",
    0x0E: "br_table",
    0x11: "call_indirect",
}


def refuse(code: str) -> None:
    raise ValueError(code)


def read_uleb(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if offset >= len(data):
            refuse("REFUSE_TRUNCATED_ULEB")
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte & 0x80 == 0:
            return value, offset
        shift += 7
        if shift > 70:
            refuse("REFUSE_OVERSIZED_ULEB")


def read_name(data: bytes, offset: int) -> tuple[str, int]:
    length, offset = read_uleb(data, offset)
    end = offset + length
    if end > len(data):
        refuse("REFUSE_TRUNCATED_NAME")
    try:
        value = data[offset:end].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("REFUSE_NON_UTF8_INTERFACE_NAME") from exc
    return value, end


def read_limits(data: bytes, offset: int) -> int:
    flags, offset = read_uleb(data, offset)
    _, offset = read_uleb(data, offset)
    if flags & 0x01:
        _, offset = read_uleb(data, offset)
    return offset


def split_sections(data: bytes) -> dict[int, bytes]:
    if not data.startswith(MAGIC_AND_VERSION):
        refuse("REFUSE_NOT_WASM_V1")
    sections: dict[int, bytes] = {}
    offset = len(MAGIC_AND_VERSION)
    while offset < len(data):
        section_id = data[offset]
        offset += 1
        size, offset = read_uleb(data, offset)
        end = offset + size
        if end > len(data):
            refuse("REFUSE_TRUNCATED_SECTION")
        if section_id == 0:
            refuse("REFUSE_CUSTOM_SECTION_SURVIVED_SEAL")
        if section_id in sections:
            refuse("REFUSE_DUPLICATE_STANDARD_SECTION")
        sections[section_id] = data[offset:end]
        offset = end
    return sections


def parse_imports(payload: bytes) -> tuple[list[tuple[str, str, int]], int]:
    if not payload:
        return [], 0
    count, offset = read_uleb(payload, 0)
    imports: list[tuple[str, str, int]] = []
    function_imports = 0
    for _ in range(count):
        module, offset = read_name(payload, offset)
        name, offset = read_name(payload, offset)
        if offset >= len(payload):
            refuse("REFUSE_TRUNCATED_IMPORT")
        kind = payload[offset]
        offset += 1
        imports.append((module, name, kind))
        if kind == 0:  # function
            function_imports += 1
            _, offset = read_uleb(payload, offset)
        elif kind == 1:  # table
            if offset >= len(payload):
                refuse("REFUSE_TRUNCATED_TABLE_IMPORT")
            offset += 1  # ref type
            offset = read_limits(payload, offset)
        elif kind == 2:  # memory
            offset = read_limits(payload, offset)
        elif kind == 3:  # global
            offset += 2
        elif kind == 4:  # tag
            offset += 1
            _, offset = read_uleb(payload, offset)
        else:
            refuse("REFUSE_UNKNOWN_IMPORT_KIND")
    if offset != len(payload):
        refuse("REFUSE_IMPORT_TRAILING_BYTES")
    return imports, function_imports


def parse_exports(payload: bytes) -> dict[str, tuple[int, int]]:
    if not payload:
        refuse("REFUSE_MISSING_EXPORT_SECTION")
    count, offset = read_uleb(payload, 0)
    exports: dict[str, tuple[int, int]] = {}
    for _ in range(count):
        name, offset = read_name(payload, offset)
        if offset >= len(payload):
            refuse("REFUSE_TRUNCATED_EXPORT")
        kind = payload[offset]
        offset += 1
        index, offset = read_uleb(payload, offset)
        if name in exports:
            refuse("REFUSE_DUPLICATE_EXPORT_NAME")
        exports[name] = (kind, index)
    if offset != len(payload):
        refuse("REFUSE_EXPORT_TRAILING_BYTES")
    return exports


def parse_code_bodies(payload: bytes) -> list[bytes]:
    if not payload:
        refuse("REFUSE_MISSING_CODE_SECTION")
    count, offset = read_uleb(payload, 0)
    bodies: list[bytes] = []
    for _ in range(count):
        size, offset = read_uleb(payload, offset)
        end = offset + size
        if end > len(payload):
            refuse("REFUSE_TRUNCATED_FUNCTION_BODY")
        bodies.append(payload[offset:end])
        offset = end
    if offset != len(payload):
        refuse("REFUSE_CODE_TRAILING_BYTES")
    return bodies


def skip_sleb(data: bytes, offset: int) -> int:
    # Width is irrelevant to this verifier; consume the LEB encoding.
    _, offset = read_uleb(data, offset)
    return offset


def assert_branchless_body(body: bytes) -> None:
    local_groups, offset = read_uleb(body, 0)
    for _ in range(local_groups):
        _, offset = read_uleb(body, offset)
        if offset >= len(body):
            refuse("REFUSE_TRUNCATED_LOCAL")
        offset += 1

    ended = False
    while offset < len(body):
        opcode = body[offset]
        offset += 1
        if opcode in BRANCH_OPS:
            refuse(f"REFUSE_BRANCH_OPCODE_{BRANCH_OPS[opcode].upper()}")
        if opcode == 0x0B:  # end
            ended = True
            break
        if opcode in (0x00, 0x01, 0x0F, 0x1A, 0x1B):
            continue
        if opcode == 0x10:  # call
            _, offset = read_uleb(body, offset)
            continue
        if 0x20 <= opcode <= 0x24:  # local/global get/set/tee
            _, offset = read_uleb(body, offset)
            continue
        if 0x28 <= opcode <= 0x3E:  # loads/stores: align, offset
            _, offset = read_uleb(body, offset)
            _, offset = read_uleb(body, offset)
            continue
        if opcode in (0x3F, 0x40):  # memory.size/grow memory index
            _, offset = read_uleb(body, offset)
            continue
        if opcode in (0x41, 0x42):
            offset = skip_sleb(body, offset)
            continue
        if opcode == 0x43:
            offset += 4
            continue
        if opcode == 0x44:
            offset += 8
            continue
        if 0x45 <= opcode <= 0xC4:  # scalar comparison/arithmetic/conversion
            continue
        if opcode == 0xD0:  # ref.null
            offset += 1
            continue
        if opcode == 0xD1:  # ref.is_null
            continue
        if opcode == 0xD2:  # ref.func
            _, offset = read_uleb(body, offset)
            continue
        refuse(f"REFUSE_UNPARSED_OPCODE_0X{opcode:02X}")

    if not ended or offset != len(body):
        refuse("REFUSE_NONCANONICAL_RUN_BODY_END")


def verify(path: pathlib.Path) -> dict[str, object]:
    data = path.read_bytes()
    sections = split_sections(data)
    imports, function_imports = parse_imports(sections.get(2, b""))
    if imports != [("chatman", "construct", 0)]:
        refuse(f"REFUSE_IMPORT_SURFACE_{imports!r}")

    exports = parse_exports(sections.get(7, b""))
    if "run" not in exports or exports["run"][0] != 0:
        refuse("REFUSE_MISSING_RUN_FUNCTION_EXPORT")

    # No runtime data payload: therefore standard-section strings can only be
    # names carried by import/export sections after custom-section erasure.
    data_payload = sections.get(11)
    if data_payload is not None:
        segment_count, end = read_uleb(data_payload, 0)
        if segment_count != 0 or end != len(data_payload):
            refuse("REFUSE_RUNTIME_DATA_SEGMENT")

    run_index = exports["run"][1]
    if run_index < function_imports:
        refuse("REFUSE_RUN_IS_IMPORTED")
    defined_index = run_index - function_imports
    bodies = parse_code_bodies(sections.get(10, b""))
    if defined_index >= len(bodies):
        refuse("REFUSE_RUN_BODY_MISSING")
    assert_branchless_body(bodies[defined_index])

    return {
        "bytes": len(data),
        "imports": [f"{m}.{n}" for m, n, _ in imports],
        "exports": sorted(exports),
        "run_function_index": run_index,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("wasm", type=pathlib.Path)
    args = parser.parse_args()
    try:
        result = verify(args.wasm)
    except ValueError as exc:
        print(f"REFUSED: {exc}")
        return 1
    print(
        "ADMITTED_WASM_PART: "
        f"bytes={result['bytes']} imports={','.join(result['imports'])} "
        f"exports={','.join(result['exports'])} run_index={result['run_function_index']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
