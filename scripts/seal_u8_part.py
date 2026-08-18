#!/usr/bin/env python3
"""Deterministically erase all WebAssembly custom sections from a u8 part.

Custom sections are semantically optional metadata and are the principal place
where compiler/toolchain strings can survive manufacture. The sealed artifact
keeps only standard WebAssembly sections; import/export names remain because
they are the interchangeable-part boundary.
"""

from __future__ import annotations

import argparse
import pathlib

MAGIC_AND_VERSION = b"\x00asm\x01\x00\x00\x00"


def read_uleb(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if offset >= len(data):
            raise ValueError("REFUSE_TRUNCATED_ULEB")
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte & 0x80 == 0:
            return value, offset
        shift += 7
        if shift > 35:
            raise ValueError("REFUSE_OVERSIZED_ULEB")


def encode_uleb(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def strip_custom_sections(data: bytes) -> bytes:
    if not data.startswith(MAGIC_AND_VERSION):
        raise ValueError("REFUSE_NOT_WASM_V1")
    out = bytearray(MAGIC_AND_VERSION)
    offset = len(MAGIC_AND_VERSION)
    while offset < len(data):
        section_id = data[offset]
        offset += 1
        size, payload_start = read_uleb(data, offset)
        payload_end = payload_start + size
        if payload_end > len(data):
            raise ValueError("REFUSE_TRUNCATED_SECTION")
        if section_id != 0:
            out.append(section_id)
            out.extend(encode_uleb(size))
            out.extend(data[payload_start:payload_end])
        offset = payload_end
    return bytes(out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    original = args.input.read_bytes()
    sealed = strip_custom_sections(original)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(sealed)
    print(f"SEALED: input_bytes={len(original)} output_bytes={len(sealed)} custom_metadata=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
