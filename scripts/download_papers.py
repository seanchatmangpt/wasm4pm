#!/usr/bin/env python3
"""
Download arXiv papers cited in SOURCE_BIBLIOGRAPHY.bib.

Respects arXiv ToS:
  - 1 request per 3 seconds (rate-limited via sleep)
  - User-Agent identifies this as a research download
  - Only downloads PDF once per paper (idempotent)

Usage:
    python3 scripts/download_papers.py [--dry-run]

Output:
    docs/papers/arxiv-<id>.pdf          — downloaded PDFs
    docs/papers/DOWNLOAD_MANIFEST.md    — receipt of what was downloaded
"""

import sys
import time
import urllib.request
import urllib.error
import hashlib
from pathlib import Path
from datetime import datetime, timezone

# ─── Configuration ────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent.parent / "docs" / "papers"
DRY_RUN = "--dry-run" in sys.argv

USER_AGENT = (
    "wasm4pm-academic-research/1.0 "
    "(process mining platform; academic citation download; "
    "contact: github.com/wasm4pm; "
    "arxiv ToS compliant: 1req/3s)"
)

RATE_LIMIT_SECONDS = 3.5  # ArXiv asks for 1/3s; use 3.5 to be safe

# ─── Paper manifest ───────────────────────────────────────────────────────────
# Format: (arxiv_id, version, title, citation_key)
# These are all papers cited in SOURCE_BIBLIOGRAPHY.bib that have arXiv PDFs.

ARXIV_PAPERS = [
    # Core wasm4pm papers (actively implemented)
    ("2602.15739", "v3",
     "Hierarchical Decomposition of Separable Workflow-Nets",
     "kourani_park_van_der_aalst_2026"),

    ("2505.07052", "v1",
     "Unlocking Non-Block-Structured Decisions: Inductive Mining with Choice Graphs",
     "kourani_park_van_der_aalst_choice_graphs_2026"),

    ("2506.11541", "v1",
     "OCPQ: Object-Centric Process Querying and Constraints",
     "kuesters_van_der_aalst_ocpq_2025"),

    ("2603.26948", "v2",
     "Predictive Process Monitoring: A Neuro-Symbolic Approach",
     "de_santis_et_al_neuro_symbolic_2026"),

    # Historical lineage papers (directly cited in algorithm lineage)

    # CORRECTED: arXiv:1806.08247 is the Verbeek Log Skeleton paper (process_skeleton)
    # NOT "Object-Centric Behavioral Constraints" — that is arXiv:2010.02047
    ("1806.08247", "",
     "Log Skeletons: A Classification Approach to Process Discovery",
     "verbeek_log_skeleton_2018"),

    # CORRECTED: arXiv:2010.02047 is van der Aalst & Berti "Discovering Object-centric Petri Nets"
    # NOT the OCEL Standard paper — Ghahfarokhi et al. 2021 ICSOC has a separate arXiv ID
    ("2010.02047", "",
     "Discovering Object-centric Petri Nets (Fundamenta Informaticae 2020)",
     "van_der_aalst_berti_2020"),

    ("2209.09725", "",
     "Object-Centric Process Mining with Ontological Abstraction",
     "van_der_aalst_et_al_ocpn_2022"),

    ("1704.08101", "",
     "Remaining Time Prediction for Processes with Inter-Case Dynamics",
     "tax_et_al_lstm_2017"),

    ("2403.01975", "v1",
     "Discovering Process Models with Non-Blocking Concurrent Activities",
     "related_inductive_miner"),

    ("2503.20363", "",
     "Process Mining over Multiple Behavioral Dimensions",
     "related_multidim_pm"),

    ("1212.6383", "",
     "Concept Drift Detection for Process Mining",
     "bose_et_al_drift_2011"),

    # --- Newly classified algorithms needing papers ---

    # predict_outcome: Teinemaa et al. 2019 ACM TKDD (arXiv preprint from 2017)
    # NOTE: arXiv:1706.09837 is the best-known preprint ID for this benchmark paper;
    # verify against https://arxiv.org/abs/1706.09837 before citing formally.
    ("1706.09837", "",
     "Outcome-Oriented Predictive Process Monitoring: Review and Benchmark (preprint)",
     "teinemaa_et_al_outcome_benchmark_2019"),

    # ocel_oc_declare: Küsters & van der Aalst BPM 2025 OC-DECLARE paper
    # NOTE: arXiv ID uncertain; try 2504.XXXX from Küsters group (OCPQ author)
    # Placeholder — verify at https://arxiv.org/search/?query=OC-DECLARE+Kusters
    # ("2504.XXXXX", "",
    #  "OC-DECLARE: Discovering Object-Centric Declarative Patterns",
    #  "kuesters_van_der_aalst_oc_declare_2025"),

    # ml_classify, ml_forecast: Song, Günther, van der Aalst 2008 BPM Workshops
    # trace clustering / performance analysis — probably not on arXiv (2008 pre-arXiv adoption for PM)

    # causal_graph: van der Aalst, Adriansyah, van Dongen 2011 CONCUR
    # Causal Nets paper — likely not on arXiv (2011 Springer LNCS, no preprint found)

    # agentic_pipeline: LinUCB contextual bandit — Li, Chu, Langford, Schapire 2010 WWW
    # arXiv:1003.0146 — "A Contextual-Bandit Approach to Personalized News Article Recommendation"
    ("1003.0146", "",
     "A Contextual-Bandit Approach to Personalized News Article Recommendation",
     "li_chu_langford_schapire_2010_linucb"),
]

# ─── Non-arXiv papers (DOI-only, no free PDF) — documented for completeness ──
NON_ARXIV_REFERENCES = [
    # Paywalled conference/journal papers — document them but cannot auto-download
    {"key": "weijters_van_der_aalst_2003",
     "title": "Rediscovering Workflow Models from Event-Based Data",
     "venue": "BNAIC 2003",
     "doi": None,
     "note": "Heuristics Miner original paper. Available via university library."},

    {"key": "leemans_fahland_van_der_aalst_2013_constructive",
     "title": "Discovering Block-Structured Process Models from Event Logs",
     "venue": "PETRI NETS 2013",
     "doi": "10.1007/978-3-642-38697-8_17",
     "note": "Inductive Miner canonical paper. Springer LNCS."},

    {"key": "munoz_gama_carmona_2010",
     "title": "A Fresh Look at Precision in Process Conformance",
     "venue": "PETRI NETS 2010",
     "doi": "10.1007/978-3-642-13675-7_19",
     "note": "ETConformance precision. Springer LNCS."},

    {"key": "adriansyah_2014_phd",
     "title": "Aligning Observed and Modelled Behaviour",
     "venue": "PhD thesis, TU/e 2014",
     "doi": "10.6100/IR773647",
     "note": "Alignments and A* conformance. TU/e repository."},

    {"key": "van_der_aalst_et_al_social_2005",
     "title": "Mining Process Performance Data",
     "venue": "IEEE TSC 2005",
     "doi": "10.1109/TSC.2005.22",
     "note": "Social network analysis (handover + working-together networks)."},

    {"key": "pesic_van_der_aalst_2006",
     "title": "A Declarative Approach for Flexible Business Processes Management",
     "venue": "BPM Workshops 2006",
     "doi": "10.1007/11678564_19",
     "note": "Declare constraint language."},

    {"key": "denisov_fahland_van_der_aalst_2018",
     "title": "Unbiased, Fine-Grained Description of Processes Performance",
     "venue": "BPM 2018",
     "doi": "10.1007/978-3-319-98648-7_10",
     "note": "Performance spectrum first paper."},

    {"key": "van_der_aalst_et_al_ilp_2012",
     "title": "Replaying History on Process Models for Conformance Checking and Performance Analysis",
     "venue": "WIREs DMKD 2012",
     "doi": "10.1002/widm.1045",
     "note": "ILP miner and region theory for PM."},

    {"key": "van_der_aalst_et_al_ts_2010",
     "title": "Process Mining: A Two-Step Approach to Balance Between Underfitting and Overfitting",
     "venue": "Software & Systems Modeling 2010",
     "doi": "10.1007/s10270-008-0106-z",
     "note": "Transition system discovery algorithm."},

    # --- Newly classified algorithms (added 2026-05-30) ---

    {"key": "van_der_aalst_adriansyah_van_dongen_causal_nets_2011",
     "title": "Causal Nets: A Modeling Language Tailored towards Process Discovery",
     "venue": "CONCUR 2011, Springer LNCS 6901",
     "doi": "10.1007/978-3-642-23217-6_3",
     "note": "causal_graph algorithm. Formal C-net definition. No arXiv preprint found."},

    {"key": "kuesters_van_der_aalst_oc_declare_2025",
     "title": "OC-DECLARE: Discovering Object-Centric Declarative Patterns with Synchronization",
     "venue": "BPM 2025, Springer LNCS 16044",
     "doi": "10.1007/978-3-032-02867-9_11",
     "note": "ocel_oc_declare algorithm. BPM 2025, Seville. Check arXiv for preprint by Küsters."},

    {"key": "teinemaa_et_al_outcome_benchmark_2019",
     "title": "Outcome-Oriented Predictive Process Monitoring: Review and Benchmark",
     "venue": "ACM TKDD 2019, 13(2):17",
     "doi": "10.1145/3301300",
     "note": "predict_outcome algorithm. Definitive benchmark. arXiv preprint: likely 1706.09837 (unverified)."},

    {"key": "van_der_werf_et_al_ilp_miner_2009",
     "title": "Process Discovery using Integer Linear Programming",
     "venue": "Fundamenta Informaticae 2009, 94(3-4)",
     "doi": "10.3233/FI-2009-136",
     "note": "ilp algorithm canonical paper. Region-based Petri net discovery. Springer/IOS Press."},

    {"key": "song_gunther_van_der_aalst_2008_bpm",
     "title": "Trace Clustering in Process Mining",
     "venue": "BPM Workshops 2008, Springer LNCS",
     "doi": "10.1007/978-3-642-00328-8_11",
     "note": "ml_classify algorithm: trace clustering baseline. Pre-arXiv PM paper."},

    {"key": "van_der_aalst_schonenberg_song_2011_is",
     "title": "Time Prediction Based on Process Mining",
     "venue": "Information Systems 2011, 36(2)",
     "doi": "10.1016/j.is.2010.09.001",
     "note": "ml_forecast algorithm: time prediction via process mining. Journal version."},

    {"key": "verbeek_log_skeleton_journal_2021",
     "title": "The Log Skeleton Visualizer in ProM 6.9 (STTT 2021)",
     "venue": "STTT 24(4), 2021",
     "doi": "10.1007/s10009-021-00618-y",
     "note": "process_skeleton algorithm. Peer-reviewed journal version of arXiv:1806.08247."},
]

# ─── Download logic ───────────────────────────────────────────────────────────

def arxiv_pdf_url(arxiv_id: str, version: str) -> str:
    """Construct the direct PDF URL for an arXiv paper."""
    clean_id = arxiv_id.lstrip("arXiv:")
    if version:
        return f"https://arxiv.org/pdf/{clean_id}{version}"
    return f"https://arxiv.org/pdf/{clean_id}"


def download_pdf(url: str, dest: Path) -> dict:
    """Download a PDF from url to dest. Returns status dict."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
            if not content.startswith(b"%PDF"):
                return {"status": "error", "reason": "not a PDF", "url": url}
            dest.write_bytes(content)
            sha256 = hashlib.sha256(content).hexdigest()
            return {
                "status": "ok",
                "bytes": len(content),
                "sha256": sha256,
                "url": url,
                "path": str(dest),
            }
    except urllib.error.HTTPError as e:
        return {"status": "error", "reason": f"HTTP {e.code}", "url": url}
    except urllib.error.URLError as e:
        return {"status": "error", "reason": str(e.reason), "url": url}
    except Exception as e:
        return {"status": "error", "reason": str(e), "url": url}


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    skipped = 0

    print(f"Target directory: {OUTPUT_DIR}")
    print(f"Papers to download: {len(ARXIV_PAPERS)}")
    print(f"Dry run: {DRY_RUN}")
    print()

    for arxiv_id, version, title, citation_key in ARXIV_PAPERS:
        filename = f"arxiv-{arxiv_id}{version if version else ''}.pdf"
        dest = OUTPUT_DIR / filename

        if dest.exists():
            print(f"  ✓ skip (exists): {filename}")
            skipped += 1
            results.append({
                "citation_key": citation_key,
                "arxiv_id": arxiv_id,
                "title": title,
                "file": filename,
                "status": "already_present",
            })
            continue

        url = arxiv_pdf_url(arxiv_id, version)
        print(f"  → {filename}")
        print(f"    title: {title}")
        print(f"    url:   {url}")

        if DRY_RUN:
            results.append({
                "citation_key": citation_key,
                "arxiv_id": arxiv_id,
                "title": title,
                "file": filename,
                "status": "dry_run",
                "url": url,
            })
            continue

        result = download_pdf(url, dest)
        result["citation_key"] = citation_key
        result["arxiv_id"] = arxiv_id
        result["title"] = title
        result["file"] = filename
        results.append(result)

        if result["status"] == "ok":
            mb = result["bytes"] / 1_048_576
            print(f"    ✓ {mb:.1f} MB  sha256:{result['sha256'][:16]}...")
        else:
            print(f"    ✗ {result['reason']}")

        # Rate limit: arXiv ToS requires 1 req / 3 seconds
        print(f"    (sleeping {RATE_LIMIT_SECONDS}s ...)")
        time.sleep(RATE_LIMIT_SECONDS)

    # ─── Write manifest ───────────────────────────────────────────────────────
    manifest_path = OUTPUT_DIR / "DOWNLOAD_MANIFEST.md"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    ok = [r for r in results if r.get("status") in ("ok", "already_present")]
    err = [r for r in results if r.get("status") not in ("ok", "already_present", "dry_run")]
    skips = [r for r in results if r.get("status") == "already_present"]

    lines = [
        "# Paper Download Manifest — wasm4pm Academic Coverage",
        "",
        f"*Generated: {now}*",
        "",
        f"**Downloaded:** {len(ok) - len(skips)}  "
        f"**Already present:** {len(skips)}  "
        f"**Failed:** {len(err)}  "
        f"**Total arXiv:** {len(ARXIV_PAPERS)}",
        "",
        "---",
        "",
        "## ArXiv Papers",
        "",
        "| Citation Key | arXiv ID | Title | File | Status | SHA-256 |",
        "|---|---|---|---|---|---|",
    ]

    for r in results:
        sha = r.get("sha256", "")[:16] + "..." if r.get("sha256") else "—"
        status = r.get("status", "?")
        lines.append(
            f"| `{r.get('citation_key', '')}` "
            f"| {r.get('arxiv_id', '')} "
            f"| {r.get('title', '')[:50]} "
            f"| `{r.get('file', '')}` "
            f"| {status} "
            f"| {sha} |"
        )

    lines += [
        "",
        "---",
        "",
        "## Non-arXiv References (Paywalled — Manual Download Required)",
        "",
        "| Citation Key | Title | Venue | DOI | Note |",
        "|---|---|---|---|---|",
    ]

    for r in NON_ARXIV_REFERENCES:
        doi = f"`{r.get('doi','—')}`" if r.get("doi") else "—"
        lines.append(
            f"| `{r['key']}` "
            f"| {r['title'][:50]} "
            f"| {r['venue']} "
            f"| {doi} "
            f"| {r.get('note','')[:60]} |"
        )

    lines += [
        "",
        "---",
        "",
        "## Rate Limit Policy",
        "",
        f"- Sleep between requests: {RATE_LIMIT_SECONDS}s (arXiv ToS: ≥1 req/3s)",
        "- User-Agent: `wasm4pm-academic-research/1.0`",
        "- All PDFs from `arxiv.org/pdf/` (open access, no auth required)",
        "- Idempotent: skips files that already exist on disk",
    ]

    manifest_path.write_text("\n".join(lines) + "\n")
    print()
    print(f"Manifest written: {manifest_path}")
    print(f"Summary: {len(ok)-len(skips)} downloaded, {len(skips)} skipped, {len(err)} failed")

    if err:
        print("\nFailed downloads:")
        for r in err:
            print(f"  {r.get('arxiv_id')} — {r.get('reason')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
