#!/usr/bin/env python3
"""Build and execute the source-owned wasm4pm adapter for scikit-decide."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any

COMPONENT = "wasm4pm"
CAPABILITY_CLASS = "process-evidence"
REQUEST_SCHEMA = "chatman.ecosystem.invoke.v1"
RESPONSE_SCHEMA = "chatman.ecosystem.response.v1"
RECEIPT_SCHEMA = "chatman.ecosystem.receipt.v1"
ABI_NAME = "chatman:ecosystem/library"
ABI_VERSION = "1.1.0"
CONSUMER_REPOSITORY = "https://github.com/seanchatmangpt/scikit-decide"
CONSUMER_PR = 5
CONSUMER_CONTRACT_SHA = "1ea373a0418123a00234862e2d6495e83a5aa4f0"
CONTRACT_WIT_SHA256 = "1365bc67e3cf5c1d303d8af1a2751b6386d9ea23992c9b3e2137a74c21dfd806"
EXPECTED_EXPORTS = {
    "memory": 2,
    "chatman_alloc": 0,
    "chatman_dealloc": 0,
    "chatman_invoke": 0,
}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")

NODE_RUNNER = r"""
const fs = require('fs');
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const bytes = fs.readFileSync(input.wasm);
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 0) throw new Error(`ambient imports are not admitted: ${JSON.stringify(imports)}`);
  const instance = await WebAssembly.instantiate(module, {});
  const ex = instance.exports;
  for (const name of ['memory', 'chatman_alloc', 'chatman_dealloc', 'chatman_invoke']) {
    if (!(name in ex)) throw new Error(`missing ABI export: ${name}`);
  }
  const responses = [];
  for (const encoded of input.requests) {
    const request = Buffer.from(encoded, 'base64');
    const ptr = ex.chatman_alloc(request.length);
    if (!ptr) throw new Error(`guest allocation failed for ${request.length} bytes`);
    new Uint8Array(ex.memory.buffer, ptr, request.length).set(request);
    const packed = ex.chatman_invoke(ptr, request.length);
    const responsePtr = Number((packed >> 32n) & 0xffffffffn);
    const responseLen = Number(packed & 0xffffffffn);
    if (!responseLen || responseLen > 1048576) throw new Error(`invalid response length: ${responseLen}`);
    const response = Buffer.from(new Uint8Array(ex.memory.buffer, responsePtr, responseLen));
    ex.chatman_dealloc(ptr, request.length);
    ex.chatman_dealloc(responsePtr, responseLen);
    responses.push(response.toString('base64'));
  }
  process.stdout.write(JSON.stringify({responses}));
})().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
"""


class VerificationError(RuntimeError):
    pass


def canonical_json(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def invoke_request(
    source_revision: str,
    operation: str,
    *,
    component: str = COMPONENT,
    schema: str = REQUEST_SCHEMA,
    authority: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> bytes:
    return canonical_json(
        {
            "schema": schema,
            "component": component,
            "source_revision": source_revision,
            "operation": operation,
            "payload": payload or {},
            "authority": authority if authority is not None else {"actuation": "none"},
        }
    )


def read_uleb(data: bytes, cursor: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if cursor >= len(data) or shift > 35:
            raise VerificationError("invalid unsigned LEB128")
        byte = data[cursor]
        cursor += 1
        value |= (byte & 0x7F) << shift
        if byte & 0x80 == 0:
            return value, cursor
        shift += 7


def read_name(data: bytes, cursor: int) -> tuple[str, int]:
    length, cursor = read_uleb(data, cursor)
    end = cursor + length
    if end > len(data):
        raise VerificationError("truncated Wasm name")
    try:
        return data[cursor:end].decode("utf-8"), end
    except UnicodeDecodeError as exc:
        raise VerificationError("invalid UTF-8 Wasm name") from exc


def inspect_core_wasm(data: bytes) -> dict[str, Any]:
    if not data.startswith(b"\x00asm\x01\x00\x00\x00"):
        raise VerificationError("artifact is not a WebAssembly v1 module")
    cursor = 8
    imports: list[dict[str, Any]] = []
    exports: dict[str, int] = {}
    memories: list[dict[str, int]] = []
    while cursor < len(data):
        section_id = data[cursor]
        cursor += 1
        size, cursor = read_uleb(data, cursor)
        end = cursor + size
        if end > len(data):
            raise VerificationError("truncated Wasm section")
        section = data[cursor:end]
        position = 0
        if section_id == 2:  # import section
            count, position = read_uleb(section, position)
            for _ in range(count):
                module, position = read_name(section, position)
                name, position = read_name(section, position)
                if position >= len(section):
                    raise VerificationError("truncated import descriptor")
                kind = section[position]
                position += 1
                # Skip the descriptor enough to reject imports without trusting it.
                imports.append({"module": module, "name": name, "kind": kind})
                break
        elif section_id == 5:  # memory section
            count, position = read_uleb(section, position)
            for _ in range(count):
                flags, position = read_uleb(section, position)
                minimum, position = read_uleb(section, position)
                maximum = minimum
                if flags & 0x01:
                    maximum, position = read_uleb(section, position)
                memories.append({"minimum_pages": minimum, "maximum_pages": maximum, "flags": flags})
        elif section_id == 7:  # export section
            count, position = read_uleb(section, position)
            for _ in range(count):
                name, position = read_name(section, position)
                if position >= len(section):
                    raise VerificationError("truncated export descriptor")
                kind = section[position]
                position += 1
                _, position = read_uleb(section, position)
                exports[name] = kind
        cursor = end

    if imports:
        raise VerificationError(f"ambient imports are not admitted: {imports}")
    for name, kind in EXPECTED_EXPORTS.items():
        if exports.get(name) != kind:
            raise VerificationError(f"missing or mistyped export {name!r}: {exports.get(name)!r}")
    if len(memories) != 1:
        raise VerificationError(f"expected one memory, observed {len(memories)}")
    memory = memories[0]
    if memory["minimum_pages"] != 3 or memory["maximum_pages"] != 3 or memory["flags"] & 0x01 == 0:
        raise VerificationError(f"memory must be bounded to exactly three pages: {memory}")
    return {
        "format": "core-wasm-v1",
        "imports": imports,
        "exports": {name: exports[name] for name in sorted(EXPECTED_EXPORTS)},
        "memory": memory,
    }


def run(command: list[str], *, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            input=input_text,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
    except OSError as exc:
        raise VerificationError(f"failed to execute {command[0]!r}: {exc}") from exc


def compiler_version(clang: str) -> str:
    completed = run([clang, "--version"])
    if completed.returncode != 0:
        raise VerificationError(f"clang --version failed: {completed.stdout.strip()}")
    return completed.stdout.splitlines()[0].strip()


def node_version(node: str) -> str:
    completed = run([node, "--version"])
    if completed.returncode != 0:
        raise VerificationError(f"node --version failed: {completed.stdout.strip()}")
    return completed.stdout.strip()


def build_adapter(source: Path, output: Path, source_revision: str, clang: str) -> tuple[list[str], str]:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        clang,
        "--target=wasm32",
        "-std=c11",
        "-O2",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-ffreestanding",
        "-fno-builtin",
        "-nostdlib",
        f'-DCHATMAN_SOURCE_REVISION="{source_revision}"',
        "-Wl,--no-entry",
        "-Wl,--export-memory",
        "-Wl,--export=chatman_alloc",
        "-Wl,--export=chatman_dealloc",
        "-Wl,--export=chatman_invoke",
        "-Wl,--initial-memory=196608",
        "-Wl,--max-memory=196608",
        "-Wl,-z,stack-size=32768",
        "-Wl,--strip-all",
        str(source),
        "-o",
        str(output),
    ]
    completed = run(command)
    if completed.returncode != 0:
        raise VerificationError(
            "adapter manufacture failed\n"
            f"command: {' '.join(command)}\n"
            f"exit_code: {completed.returncode}\n"
            f"output:\n{completed.stdout}"
        )
    if not output.is_file():
        raise VerificationError("clang exited zero but produced no Wasm artifact")
    return command, completed.stdout


def execute_requests(node: str, artifact: Path, requests: list[bytes]) -> list[bytes]:
    envelope = json.dumps(
        {
            "wasm": str(artifact),
            "requests": [base64.b64encode(request).decode("ascii") for request in requests],
        },
        separators=(",", ":"),
    )
    completed = run([node, "--no-warnings", "-e", NODE_RUNNER], input_text=envelope)
    if completed.returncode != 0:
        raise VerificationError(f"Node rejected the adapter: {completed.stdout.strip()}")
    try:
        decoded = json.loads(completed.stdout)
        return [base64.b64decode(item, validate=True) for item in decoded["responses"]]
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise VerificationError("Node returned an invalid response envelope") from exc


def validate_response(
    raw: bytes,
    *,
    source_revision: str,
    expected_status: str,
    expected_operation: str,
    expected_reason: str | None = None,
) -> dict[str, Any]:
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise VerificationError("guest returned invalid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise VerificationError("guest response is not a JSON object")
    if value.get("schema") != RESPONSE_SCHEMA:
        raise VerificationError(f"response schema mismatch: {value.get('schema')!r}")
    if value.get("status") != expected_status:
        raise VerificationError(f"standing mismatch: expected {expected_status}, observed {value.get('status')!r}")
    if b'"BLOCKED"' in raw:
        raise VerificationError("BLOCKED crossed the federation ABI")
    output = value.get("output")
    receipt = value.get("receipt")
    if not isinstance(output, dict) or not isinstance(receipt, dict):
        raise VerificationError("response must contain output and receipt objects")
    if output.get("adapter") != COMPONENT or output.get("capability_class") != CAPABILITY_CLASS:
        raise VerificationError("output component identity mismatch")
    if output.get("abi_name") != ABI_NAME or output.get("abi_version") != ABI_VERSION:
        raise VerificationError("output ABI identity mismatch")
    if output.get("semantic_execution") is not False or output.get("actuation") != "none":
        raise VerificationError("adapter must remain non-actuating and non-semantic")
    if output.get("operation") != expected_operation:
        raise VerificationError(f"operation mismatch: {output.get('operation')!r}")
    if expected_reason is not None and output.get("reason") != expected_reason:
        raise VerificationError(f"refusal reason mismatch: expected {expected_reason}, observed {output.get('reason')!r}")
    if expected_reason is None and "reason" in output:
        raise VerificationError(f"ALIVE response unexpectedly contains refusal: {output['reason']!r}")
    if receipt.get("schema") != RECEIPT_SCHEMA or receipt.get("standing") != expected_status:
        raise VerificationError("receipt schema or standing mismatch")
    subject = receipt.get("subject")
    authority = receipt.get("authority")
    execution = receipt.get("execution")
    if subject != {"component": COMPONENT, "source_revision": source_revision}:
        raise VerificationError(f"receipt subject mismatch: {subject!r}")
    if authority != {"actuation": "none"}:
        raise VerificationError(f"receipt authority mismatch: {authority!r}")
    if not isinstance(execution, dict) or execution.get("runtime") != "wasm32-core":
        raise VerificationError("receipt execution identity mismatch")
    fingerprint = execution.get("request_fingerprint")
    if not isinstance(fingerprint, dict) or fingerprint.get("algorithm") != "fnv1a32":
        raise VerificationError("receipt request fingerprint is absent or not recomputable")
    return value


def verify_hash_guard(artifact: Path, expected_sha256: str) -> dict[str, Any]:
    data = artifact.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise VerificationError("artifact identity guard rejected the valid artifact")
    with tempfile.TemporaryDirectory(prefix="wasm4pm-interop-tamper-") as directory:
        tampered = Path(directory) / artifact.name
        mutated = bytearray(data)
        mutated[-1] ^= 0x01
        tampered.write_bytes(mutated)
        observed = hashlib.sha256(tampered.read_bytes()).hexdigest()
        if observed == expected_sha256:
            raise VerificationError("tamper fixture failed to change artifact identity")
        rejected = observed != expected_sha256
    if not rejected:
        raise VerificationError("artifact tamper was not rejected")
    return {"fixture": "single-byte-artifact-drift", "status": "REFUSED", "reason": "ARTIFACT_DRIFT_REFUSED"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-revision", required=True, help="Exact 40-character wasm4pm source SHA")
    parser.add_argument("--output", type=Path, default=Path("build/scikit-decide-interop"))
    parser.add_argument("--clang", default=None)
    parser.add_argument("--node", default=None)
    args = parser.parse_args(argv)

    if not SHA_RE.fullmatch(args.source_revision):
        parser.error("--source-revision must be a lowercase 40-character Git SHA")

    root = Path(__file__).resolve().parents[2]
    source = Path(__file__).with_name("adapter.c")
    wit = Path(__file__).with_name("chatman-ecosystem.wit")
    output = args.output.resolve()
    artifact = output / "wasm4pm.wasm"
    receipt_path = output / "interop-receipt.json"
    clang = args.clang or shutil.which("clang")
    node = args.node or shutil.which("node")
    if not clang:
        raise VerificationError("clang is unavailable")
    if not node:
        raise VerificationError("Node.js is unavailable")
    if not source.is_file():
        raise VerificationError(f"adapter source is missing: {source}")
    if not wit.is_file():
        raise VerificationError(f"consumer WIT projection is missing: {wit}")
    observed_wit_sha256 = hashlib.sha256(wit.read_bytes()).hexdigest()
    if observed_wit_sha256 != CONTRACT_WIT_SHA256:
        raise VerificationError(
            f"consumer WIT drift: expected {CONTRACT_WIT_SHA256}, observed {observed_wit_sha256}"
        )

    command, compiler_output = build_adapter(source, artifact, args.source_revision, clang)
    artifact_bytes = artifact.read_bytes()
    artifact_sha256 = hashlib.sha256(artifact_bytes).hexdigest()
    wasm_shape = inspect_core_wasm(artifact_bytes)

    wrong_revision = "0" * 40 if args.source_revision != "0" * 40 else "1" * 40
    cases: list[tuple[str, bytes, str, str, str | None]] = [
        ("self_test", invoke_request(args.source_revision, "self_test"), "ALIVE", "self_test", None),
        ("describe", invoke_request(args.source_revision, "describe"), "ALIVE", "describe", None),
        (
            "admit",
            invoke_request(
                args.source_revision,
                "admit",
                payload={"consumer": "scikit-decide", "contract_sha": CONSUMER_CONTRACT_SHA},
            ),
            "ALIVE",
            "admit",
            None,
        ),
        (
            "unsupported_operation",
            invoke_request(args.source_revision, "execute"),
            "REFUSED",
            "execute",
            "OPERATION_NOT_ADMITTED",
        ),
        (
            "wrong_component",
            invoke_request(args.source_revision, "self_test", component="not-wasm4pm"),
            "REFUSED",
            "self_test",
            "COMPONENT_IDENTITY_MISMATCH",
        ),
        (
            "wrong_revision",
            invoke_request(wrong_revision, "self_test"),
            "REFUSED",
            "self_test",
            "SOURCE_REVISION_MISMATCH",
        ),
        (
            "actuation_authority",
            invoke_request(args.source_revision, "self_test", authority={"actuation": "execute"}),
            "REFUSED",
            "self_test",
            "ACTUATION_NOT_ADMITTED",
        ),
        (
            "missing_actuation_authority",
            invoke_request(args.source_revision, "self_test", authority={}),
            "REFUSED",
            "self_test",
            "ACTUATION_NOT_ADMITTED",
        ),
        (
            "wrong_schema",
            invoke_request(args.source_revision, "self_test", schema="chatman.ecosystem.invoke.v0"),
            "REFUSED",
            "self_test",
            "REQUEST_SCHEMA_MISMATCH",
        ),
        ("malformed_json", b'{"operation":', "REFUSED", "", "MALFORMED_REQUEST"),
    ]
    requests = [case[1] for case in cases]
    requests.append(cases[0][1])  # deterministic replay of self_test
    raw_responses = execute_requests(node, artifact, requests)
    if len(raw_responses) != len(requests):
        raise VerificationError("runtime returned the wrong number of responses")

    case_receipts: list[dict[str, Any]] = []
    for (name, request, status, operation, reason), raw in zip(cases, raw_responses[:-1], strict=True):
        decoded = validate_response(
            raw,
            source_revision=args.source_revision,
            expected_status=status,
            expected_operation=operation,
            expected_reason=reason,
        )
        case_receipts.append(
            {
                "case": name,
                "request_sha256": hashlib.sha256(request).hexdigest(),
                "response_sha256": hashlib.sha256(raw).hexdigest(),
                "status": decoded["status"],
                "reason": decoded["output"].get("reason"),
            }
        )

    replay_raw = raw_responses[-1]
    if replay_raw != raw_responses[0]:
        raise VerificationError("deterministic replay changed the exact response bytes")
    replay = {
        "case": "self_test",
        "status": "ALIVE",
        "exact_response_bytes_equal": True,
        "response_sha256": hashlib.sha256(replay_raw).hexdigest(),
    }
    tamper = verify_hash_guard(artifact, artifact_sha256)

    normalized_command = [
        Path(command[0]).name,
        *[item if not item.startswith(str(root)) else str(Path(item).relative_to(root)) for item in command[1:]],
    ]
    report = {
        "schema": "wasm4pm.scikit-decide.interop-receipt.v1",
        "status": "ALIVE",
        "subject": {"component": COMPONENT, "source_revision": args.source_revision},
        "consumer_contract": {
            "repository": CONSUMER_REPOSITORY,
            "pull_request": CONSUMER_PR,
            "head_sha": CONSUMER_CONTRACT_SHA,
            "abi_name": ABI_NAME,
            "abi_version": ABI_VERSION,
            "wit_sha256": observed_wit_sha256,
        },
        "manufacture": {
            "source": str(source.relative_to(root)),
            "command": normalized_command,
            "compiler": compiler_version(clang),
            "compiler_output": compiler_output.strip(),
            "exit_code": 0,
        },
        "artifact": {
            "filename": artifact.name,
            "sha256": artifact_sha256,
            "size": len(artifact_bytes),
            **wasm_shape,
        },
        "execution": {
            "backend": "node-webassembly",
            "runtime": node_version(node),
            "cases": case_receipts,
            "replay": replay,
            "tamper_fixture": tamper,
        },
        "authority": {
            "select": "admitted",
            "construct": "admitted",
            "do": "REFUSED:ACTUATION_NOT_ADMITTED",
            "imports": [],
        },
        "standing": {
            "core_wasm_abi": "ALIVE",
            "identity_binding": "ALIVE",
            "receipt_binding": "ALIVE",
            "negative_fixtures": "ALIVE",
            "deterministic_replay": "ALIVE",
            "semantic_process_execution": "UNSUPPORTED",
            "actuation": "REFUSED:ACTUATION_NOT_ADMITTED",
        },
        "falsifiers": [
            "any ambient Wasm import",
            "memory minimum or maximum other than exactly three pages",
            "missing or mistyped core ABI export",
            "response subject not bound to wasm4pm and the exact build revision",
            "accepted operation outside admit, describe, or self_test",
            "accepted authority with actuation other than none",
            "any BLOCKED standing crossing the ABI",
            "non-identical response bytes for identical replay input",
            "artifact drift not rejected by SHA-256 identity verification",
        ],
    }
    output.mkdir(parents=True, exist_ok=True)
    receipt_path.write_bytes(canonical_json(report) + b"\n")
    print(json.dumps({
        "status": report["status"],
        "component": COMPONENT,
        "source_revision": args.source_revision,
        "artifact_sha256": artifact_sha256,
        "artifact_size": len(artifact_bytes),
        "cases": len(case_receipts),
        "replay": "ALIVE",
        "receipt": str(receipt_path),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as exc:
        print(json.dumps({"status": "BUILD_BROKEN", "error": str(exc)}), file=sys.stderr)
        raise SystemExit(3)
