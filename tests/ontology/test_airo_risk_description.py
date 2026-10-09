"""W615: the wasm4pm AIRo risk description parses and stays grounded.

Lane W615, AIRo wiring wave. Validates
tests/ontology/airo_risk_description.ttl.
"""

from pathlib import Path
import re

REPO_ROOT = Path(__file__).resolve().parents[2]
TTL_PATH = REPO_ROOT / "tests/ontology/airo_risk_description.ttl"

AIRO = "https://w3id.org/airo#"


def test_cited_paths_exist():
    """Every `file:` citation must be a real path before anything else."""
    text = TTL_PATH.read_text()
    uris = re.findall(r"<file:([^>]+)>", text)
    assert uris, "no file: citations found — TTL is not grounded"
    missing = []
    for uri in uris:
        path = Path(uri)
        target = path if path.is_absolute() else REPO_ROOT / path
        if not target.exists():
            missing.append(uri)
    assert missing == [], f"cited paths missing on disk: {missing}"


def test_ttl_exists_and_prefixes_declared():
    text = TTL_PATH.read_text()
    for prefix in ("airo:", "dcterms:", "rdfs:", "xsd:"):
        assert f"@prefix {prefix}" in text, f"missing @prefix {prefix}"
    assert AIRO in text


def _load_graph():
    rdflib = __import__("rdflib")
    g = rdflib.Graph()
    g.parse(str(TTL_PATH), format="turtle")
    return g


def test_rdflib_parse_and_airo_structure():
    rdflib = __import__("rdflib")
    try:
        g = _load_graph()
    except ImportError:
        import pytest

        pytest.skip("rdflib not installed")
        return
    from rdflib import Namespace, RDF

    airo = Namespace(AIRO)
    system = rdflib.URIRef("https://wasm4pm.example/airo/wasm-process-mining-engine")
    assert (system, RDF.type, airo.AISystem) in g
    risks = list(g.objects(system, airo.hasRisk))
    assert len(risks) >= 3
    for risk in risks:
        assert (risk, RDF.type, airo.Risk) in g
        assert (risk, airo.hasConsequence, None) in g
        assert (risk, airo.hasLikelihood, None) in g
        for cons in g.objects(risk, airo.hasConsequence):
            assert (cons, RDF.type, airo.Consequence) in g
            assert any(True for _ in g.objects(cons, airo.hasImpact))
        for src in g.subjects(airo.isRiskSourceFor, risk):
            assert (src, RDF.type, airo.RiskSource) in g
    controls = list(g.subjects(RDF.type, airo.RiskControl))
    assert len(controls) >= 2
    for ctrl in controls:
        assert any(
            (risk, airo.hasRiskControl, ctrl) in g for risk in risks
        ), f"control {ctrl} not attached to any risk"


def test_minimal_turtle_sanity_without_rdflib():
    """Fallback structural check: quotes/brackets balance per statement."""
    text = TTL_PATH.read_text()
    stripped = re.sub(r"#[^\n]*", "", text)
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    assert stripped.count("[") == stripped.count("]")
    assert stripped.count("{") == stripped.count("}")
    assert stripped.count(")") == stripped.count("(")
    assert text.count('"') % 2 == 0
    body = [
        line.strip()
        for line in stripped.splitlines()
        if line.strip() and not line.strip().startswith("@")
    ]
    assert body, "no statements found"
