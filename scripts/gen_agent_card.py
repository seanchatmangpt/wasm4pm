#!/usr/bin/env python3
"""Generate the SA2A actuator agent card from the real public Rust surface.

Emits `.well-known/agent-card.json` (A2A v1.0 member contract) by parsing the
lib.rs re-exports and the workspace version. Fail-closed: if a published skill
loses its lib.rs export, generation refuses.

Deterministic: double run is byte-identical.
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LIB_RS = REPO / "crates/wasm4pm-sa2a-actuator/src/lib.rs"
WORKSPACE_CARGO = REPO / "Cargo.toml"
OUT = REPO / ".well-known/agent-card.json"

DESCRIPTION = (
    "Independent SA2A actuator. Authority is external: no effect is executed "
    "without an ActuationCertificate carrying an external authority signature "
    "quorum across independent trust domains, verified by the SecurityVerifier "
    "before the Effector runs. Resource allocation is powerless input admitted "
    "before the durable actuator claim; allocation identity is bound into the "
    "same durable record as the effect claim."
)

# Each published skill: exact hand-authored wording, keyed to the lib.rs
# re-exports (and wire.rs types) it must keep to stay publishable.
SKILLS = [
    {
        "id": "wasm4pm.actuator.execute",
        "name": "Execute an admitted effect",
        "description": (
            "Actuator::execute — executes a PreparedEffect against an Effector "
            "only after SecurityVerifier::verify accepts an ActuationCertificate "
            "(external authority signature quorum, independent trust domains) "
            "and the EffectLedger records the claim. Refuses with typed "
            "ActuatorRefusal otherwise."
        ),
        "tags": ["actuator", "execute", "authority", "certificate"],
        "requires": ["Actuator", "ActuationReceipt", "ActuatorContext"],
    },
    {
        "id": "wasm4pm.actuator.effect.digest",
        "name": "Digest a prepared effect",
        "description": (
            "PreparedEffect::digest — canonical-JSON sha256 digest of a "
            "version-1 PreparedEffect (principal, capability, subject, payload). "
            "Refuses invalid effects via ActuatorRefusal::InvalidEffect."
        ),
        "tags": ["effect", "digest", "canonicalization"],
        "requires": ["PreparedEffect"],
    },
    {
        "id": "wasm4pm.actuator.certificate.signing_message",
        "name": "Certificate signing message",
        "description": (
            "ActuationCertificate::signing_message — constructs the canonical "
            "'SA2A-C2-ACTUATION-CERTIFICATE-V1' signing message for an "
            "ActuationCertificate (effect digest, principal, policy/revocation "
            "epochs, generation, nonce, validity window, audience, threshold). "
            "Refuses invalid certificates via ActuatorRefusal::InvalidCertificate."
        ),
        "tags": ["certificate", "signing", "quorum"],
        "requires": ["ActuationCertificate", "CertificateSignature"],
    },
    {
        "id": "wasm4pm.actuator.verify",
        "name": "Verify an actuation certificate",
        "description": (
            "SecurityVerifier::verify — verifies an ActuationCertificate's "
            "signature quorum against the KeyRegistry (SignatureAlgorithm, "
            "KeyState including revocation epochs)."
        ),
        "tags": ["verify", "signatures", "key-registry"],
        "requires": ["SecurityVerifier", "KeyRegistry", "SignatureAlgorithm", "KeyState"],
    },
    {
        "id": "wasm4pm.actuator.resource.admit",
        "name": "Admit a resource allocation",
        "description": (
            "ResourceAdmission::admit / admit_children — admits a powerless "
            "ResourceBudget/ResourceEnvelope allocation before any effect, "
            "producing a ResourceReceipt and ResourceOcelEvent bound into the "
            "same durable record as the effect claim; supports ResourceRecovery."
        ),
        "tags": ["resource", "admission", "receipt"],
        "requires": [
            "ResourceAdmission",
            "ResourceBudget",
            "ResourceEnvelope",
            "ResourceReceipt",
            "ResourceOcelEvent",
            "ResourceRecovery",
        ],
    },
    {
        "id": "wasm4pm.actuator.ledger",
        "name": "Durable effect ledger",
        "description": (
            "EffectLedger / FileEffectLedger — durable EffectClaimRecord storage "
            "binding allocation identity and effect claims (LedgerState "
            "transitions)."
        ),
        "tags": ["ledger", "durable", "claims"],
        "requires": ["EffectLedger", "FileEffectLedger", "EffectClaimRecord", "LedgerState"],
    },
]

AUTHORITY_LAW = (
    "external authority signature quorum across independent trust domains "
    "required before any effect"
)


def parse_exports():
    """Collect re-exported names from lib.rs pub use statements (incl. the
    wire.rs types re-exported there). Fail-closed surface = lib.rs exports."""
    text = LIB_RS.read_text(encoding="utf-8")
    names = set()
    # pub use path::{A, B as C, ...}; and single-item pub use path::Name;
    for m in re.finditer(r"pub use\s+([\w:]+)::\{([^}]*)\}", text):
        for item in m.group(2).split(","):
            item = item.strip()
            if not item:
                continue
            name = item.split(" as ")[-1].strip()
            if name:
                names.add(name)
    for m in re.finditer(r"^pub use\s+[\w:]+::(\w+)\s*;", text, re.MULTILINE):
        names.add(m.group(1))
    return names


def parse_version():
    text = WORKSPACE_CARGO.read_text(encoding="utf-8")
    m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
    if not m:
        sys.exit("refusing: no workspace version in Cargo.toml")
    return m.group(1)


def format_card(card):
    """Deterministic emitter: 2-space indent, short scalar arrays kept inline
    (matches the hand-authored card's formatting)."""
    def enc(value, indent):
        pad = " " * indent
        if isinstance(value, dict):
            if not value:
                return "{}"
            items = [
                f'{pad}  {json.dumps(k, ensure_ascii=False)}: {enc(v, indent + 2)}'
                for k, v in value.items()
            ]
            return "{\n" + ",\n".join(items) + "\n" + pad + "}"
        if isinstance(value, list):
            if not value:
                return "[]"
            if all(isinstance(v, (str, int, float, bool)) for v in value):
                return "[" + ", ".join(json.dumps(v, ensure_ascii=False) for v in value) + "]"
            items = [f"{pad}  {enc(v, indent + 2)}" for v in value]
            return "[\n" + ",\n".join(items) + "\n" + pad + "]"
        return json.dumps(value, ensure_ascii=False)

    return enc(card, 0)


def main():
    exports = parse_exports()
    version = parse_version()

    missing = []
    for skill in SKILLS:
        for req in skill["requires"]:
            if req not in exports:
                missing.append((skill["id"], req))
    if missing:
        for skill_id, req in missing:
            print(f"REFUSED: skill {skill_id} lost lib.rs export: {req}", file=sys.stderr)
        sys.exit(1)

    skills_out = [
        {k: s[k] for k in ("id", "name", "description", "tags")}
        for s in SKILLS
    ]
    card = {
        "protocolVersion": "1.0",
        "name": "wasm4pm SA2A Actuator",
        "description": DESCRIPTION,
        "supportedInterfaces": [
            {"protocolVersion": "1.0", "protocolBinding": "SA2A"}
        ],
        "version": version,
        "capabilities": {"streaming": False},
        "defaultInputModes": ["application/json"],
        "defaultOutputModes": ["application/json"],
        "skills": skills_out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(format_card(card) + "\n", encoding="utf-8")
    print(f"wrote {OUT} (v{version}, {len(skills_out)} skills)")


if __name__ == "__main__":
    main()
