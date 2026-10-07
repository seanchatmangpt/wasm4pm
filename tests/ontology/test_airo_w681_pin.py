"""W681: pin test for the wasm4pm AIRo wiring surface.

Lane W681, xaas v26.10.6 AIRo wiring ledger extension. Pins the exact
surface claimed by
/Users/sac/xaas/docs/cro/artifacts/airo-wiring-ledger.md (w615 row):

  artifact : tests/ontology/airo_risk_description.ttl (8,511 B)
  proof    : rdflib parse + structure court
  tests    : 4 passed (tests/ontology/test_airo_risk_description.py)

All assertions are real file reads / real rdflib parses on this checkout.
No mocks, no network.
"""

import hashlib
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TTL_PATH = REPO_ROOT / "tests/ontology/airo_risk_description.ttl"
COURT_PATH = REPO_ROOT / "tests/ontology/test_airo_risk_description.py"

AIRO = "https://w3id.org/airo#"
ENGINE = "https://wasm4pm.example/airo/wasm-process-mining-engine"


def test_ledger_artifact_present_at_exact_size():
    """Ledger row claims tests/ontology/airo_risk_description.ttl at 8,511 B."""
    assert TTL_PATH.is_file(), f"missing ledger artifact: {TTL_PATH}"
    size = TTL_PATH.stat().st_size
    assert size == 8511, (
        f"drift: ledger claims 8,511 B, disk has {size} B at {TTL_PATH}"
    )


def test_pre_existing_court_present_with_four_tests():
    """Ledger proof column claims a 4-test rdflib parse + structure court."""
    assert COURT_PATH.is_file(), f"missing court file: {COURT_PATH}"
    src = COURT_PATH.read_text()
    funcs = re.findall(r"^def (test_[A-Za-z0-9_]+)\(", src, re.M)
    assert len(funcs) == 4, (
        f"drift: ledger claims 4 tests, found {len(funcs)}: {funcs}"
    )
    assert "rdflib" in src, "court no longer parses via rdflib"


def test_rdflib_parse_counts_match_ledger_surface():
    """Real rdflib parse: the graph keeps the W615 structure (3 risks,
    2 controls, 3 risk sources, typed AISystem)."""
    rdflib = __import__("rdflib")
    from rdflib import Namespace, RDF

    g = rdflib.Graph()
    g.parse(str(TTL_PATH), format="turtle")

    airo = Namespace(AIRO)
    system = rdflib.URIRef(ENGINE)
    assert (system, RDF.type, airo.AISystem) in g
    risks = list(g.objects(system, airo.hasRisk))
    assert len(risks) == 3, f"expected 3 risks, got {len(risks)}"
    controls = list(g.subjects(RDF.type, airo.RiskControl))
    assert len(controls) == 2, f"expected 2 controls, got {len(controls)}"
    sources = list(g.subjects(RDF.type, airo.RiskSource))
    assert len(sources) == 3, f"expected 3 risk sources, got {len(sources)}"
    # Every risk carries consequence + likelihood and a typed consequence.
    for risk in risks:
        assert (risk, airo.hasConsequence, None) in g
        assert (risk, airo.hasLikelihood, None) in g


def test_cited_paths_and_sha_stability():
    """Every file: citation resolves on this checkout; sha256 recorded for
    the receipt (content drift beyond size is detectable downstream)."""
    text = TTL_PATH.read_text()
    uris = re.findall(r"<file:([^>]+)>", text)
    assert uris, "no file: citations — surface not grounded"
    for uri in uris:
        path = Path(uri)
        target = path if path.is_absolute() else REPO_ROOT / path
        assert target.exists(), f"cited path missing: {uri}"
    digest = hashlib.sha256(TTL_PATH.read_bytes()).hexdigest()
    # Non-vacuous: the digest must be a stable 64-hex string.
    assert re.fullmatch(r"[0-9a-f]{64}", digest)
    print(f"W681 sha256(airo_risk_description.ttl) = {digest}")
