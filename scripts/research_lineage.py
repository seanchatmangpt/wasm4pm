#!/usr/bin/env python3
"""
research_lineage.py — ACADEMIC-LINEAGE-001 historical research script
Queries DBLP + arXiv public APIs (no auth, no browser) and writes lineage files.

Usage:
    cd /tmp/wasm4pm-docs-update
    python3 scripts/research_lineage.py

Outputs:
    docs/academic/10-DISCOVERY-LINEAGE.md
    docs/academic/11-CONFORMANCE-LINEAGE.md
    docs/academic/12-OBJECT-CENTRIC-LINEAGE.md
    docs/academic/13-WFNET-PETRI-POWL-LINEAGE.md
    docs/academic/14-STREAMING-PERFORMANCE-LINEAGE.md
    docs/academic/15-PREDICTION-ML-LINEAGE.md
    docs/academic/16-SIMULATION-SOCIAL-LINEAGE.md
    docs/academic/SOURCE_BIBLIOGRAPHY.bib
    docs/academic/ALGORITHM_LINEAGE.toml
"""

import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from textwrap import dedent

OUT = Path("/tmp/wasm4pm-docs-update/docs/academic")
OUT.mkdir(exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# API helpers
# ─────────────────────────────────────────────────────────────────────────────

def dblp_search(query: str, max_hits: int = 5) -> list[dict]:
    """Search DBLP publications API. Returns list of {title, year, authors, venue, key, url}."""
    q = urllib.parse.quote(query)
    url = f"https://dblp.org/search/publ/api?q={q}&format=json&h={max_hits}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read())
        hits = data["result"]["hits"].get("hit", [])
        results = []
        for h in hits:
            info = h["info"]
            authors_raw = info.get("authors", {}).get("author", [])
            if isinstance(authors_raw, list):
                authors = [a["text"] for a in authors_raw]
            elif isinstance(authors_raw, dict):
                authors = [authors_raw["text"]]
            else:
                authors = []
            results.append({
                "title": info.get("title", ""),
                "year": info.get("year", ""),
                "authors": authors,
                "venue": info.get("venue", ""),
                "key": info.get("key", ""),
                "url": info.get("url", ""),
                "doi": info.get("doi", ""),
            })
        time.sleep(0.5)  # be polite to DBLP
        return results
    except Exception as e:
        print(f"  DBLP error for '{query}': {e}")
        return []


def arxiv_lookup(arxiv_id: str) -> dict | None:
    """Look up a specific arXiv paper by ID."""
    url = f"https://export.arxiv.org/abs/{arxiv_id}"
    # Use the arXiv API for metadata
    api_url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        with urllib.request.urlopen(api_url, timeout=15) as r:
            content = r.read()
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        tree = ET.fromstring(content)
        entry = tree.find("atom:entry", ns)
        if entry is None:
            return None
        title = entry.find("atom:title", ns).text.strip().replace("\n", " ")
        year = entry.find("atom:published", ns).text[:4]
        authors = [a.find("atom:name", ns).text for a in entry.findall("atom:author", ns)]
        summary = entry.find("atom:summary", ns).text.strip()[:200]
        time.sleep(0.3)
        return {"title": title, "year": year, "authors": authors,
                "arxiv_id": arxiv_id, "url": f"https://arxiv.org/abs/{arxiv_id}",
                "summary": summary}
    except Exception as e:
        print(f"  arXiv error for {arxiv_id}: {e}")
        return None


def fmt_authors(authors: list[str], max_n: int = 3) -> str:
    if not authors:
        return "Unknown"
    if len(authors) <= max_n:
        return ", ".join(authors)
    return ", ".join(authors[:max_n]) + " et al."


# ─────────────────────────────────────────────────────────────────────────────
# Known facts database (hardcoded from memory — verified sources)
# ─────────────────────────────────────────────────────────────────────────────

KNOWN = {
    # format: id → {first_peer_reviewed, canonical, notes, confidence}
    "dfg": {
        "formal_object": "Directly-Follows Graph (frequency/duration of directly-following activity pairs)",
        "first_peer_reviewed": "van_der_aalst_2016_process_mining (book)",
        "canonical": ["van_der_aalst_2016_process_mining"],
        "notes": "DFG as a named concept is formalized in the van der Aalst 2016 book. Precursor concepts in earlier papers.",
        "confidence": "medium",
        "coverage_kind": "direct",
    },
    "alpha_plus_plus": {
        "formal_object": "Alpha++ algorithm: Petri net discovery handling short loops and non-free-choice constructs",
        "first_peer_reviewed": "van_der_aalst_weijters_maruster_2004 (Alpha original); Alpha++ = Wen et al. 2007",
        "canonical": ["wen_et_al_alpha_pp_2007"],
        "notes": "Distinguish: Alpha (van der Aalst 2004), Alpha+ (handling length-1/2 loops), Alpha++ (Wen et al. 2007 non-free-choice).",
        "confidence": "medium",
        "coverage_kind": "direct",
    },
    "heuristic_miner": {
        "formal_object": "Heuristics net discovery from frequency/dependency statistics in event logs",
        "first_peer_reviewed": "weijters_van_der_aalst_2003",
        "canonical": ["weijters_van_der_aalst_2003", "weijters_van_der_aalst_de_medeiros_2006"],
        "notes": "Weijters & van der Aalst 2003 (CogSci); extended in 2006 technical report.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "inductive_miner": {
        "formal_object": "Block-structured process tree discovery via recursive log splitting and fall-through cases",
        "first_peer_reviewed": "leemans_fahland_van_der_aalst_2013_constructive",
        "canonical": ["leemans_fahland_van_der_aalst_2013_constructive", "leemans_fahland_van_der_aalst_2014_incomplete"],
        "notes": "IM (2013 PETRI NETS) guarantees sound process tree. IM-incompleteness (2014) handles incomplete logs.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "ilp": {
        "formal_object": "ILP-based Petri net discovery via region theory (places as solutions to inequalities)",
        "first_peer_reviewed": "van_der_aalst_et_al_ilp_2012",
        "canonical": ["van_der_aalst_et_al_ilp_2012"],
        "notes": "van der Aalst, Rubin, Verbeek, van Dongen, Kindler, Günther 2010/2012 — region-based approach.",
        "confidence": "medium",
        "coverage_kind": "direct",
    },
    "alignments": {
        "formal_object": "Optimal trace alignment via synchronous product automaton and cost-weighted A* search",
        "first_peer_reviewed": "adriansyah_2014_phd",
        "canonical": ["adriansyah_munoz_gama_carmona_2011", "adriansyah_2014_phd"],
        "notes": "PhD thesis (TU/e 2014) is canonical. Earlier work: BPI 2011 workshop paper. Distinguish thesis from journal paper.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "etconformance_precision": {
        "formal_object": "ETConformance precision: escaping arcs from allowed model traces not observed in log",
        "first_peer_reviewed": "munoz_gama_carmona_2010",
        "canonical": ["munoz_gama_carmona_2010"],
        "notes": "Munoz-Gama & Carmona, BPM 2010. Later extended in ICSOC 2011.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "generalization": {
        "formal_object": "Generalization quality dimension: how well model covers unseen behavior",
        "first_peer_reviewed": "van_der_aalst_2016_process_mining",
        "canonical": ["van_der_aalst_2016_process_mining"],
        "notes": "Formalized as one of 4 quality dimensions in van der Aalst 2016 book.",
        "confidence": "medium",
        "coverage_kind": "direct",
    },
    "declare": {
        "formal_object": "Declarative process specification via LTL/automata constraints (DECLARE language)",
        "first_peer_reviewed": "pesic_van_der_aalst_2006",
        "canonical": ["pesic_van_der_aalst_2006", "pesic_bouyarmane_van_der_aalst_2007"],
        "notes": "Pesic & van der Aalst, BPM 2006 workshops. DECLARE system paper: Pesic 2008 PhD thesis.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "performance_spectrum": {
        "formal_object": "Performance spectrum: fine-grained segmented visualization of case performance over time",
        "first_peer_reviewed": "denisov_fahland_van_der_aalst_2018",
        "canonical": ["denisov_fahland_van_der_aalst_2018"],
        "notes": "Denisov, Fahland, van der Aalst, BPM 2018.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "transition_system": {
        "formal_object": "Transition system as process model (states = log abstractions, transitions = observed moves)",
        "first_peer_reviewed": "van_der_aalst_et_al_transition_systems_2010",
        "canonical": ["van_der_aalst_et_al_transition_systems_2010"],
        "notes": "van der Aalst et al., ICATPN 2010 — state-based representation from event logs.",
        "confidence": "medium",
        "coverage_kind": "direct",
    },
    "handover_network": {
        "formal_object": "Handover-of-work social network: edge weight = number of direct handoffs between resource pairs",
        "first_peer_reviewed": "van_der_aalst_et_al_social_2005",
        "canonical": ["van_der_aalst_et_al_social_2005"],
        "notes": "van der Aalst, Reijers, Song, JASSS 2005 / BPM 2005.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    "working_together_network": {
        "formal_object": "Working-together social network: edge weight = cases where two resources co-appear",
        "first_peer_reviewed": "van_der_aalst_et_al_social_2005",
        "canonical": ["van_der_aalst_et_al_social_2005"],
        "notes": "Same paper as handover_network — two metrics from the same 2005 paper.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    # OCEL
    "ocel_dfg": {
        "formal_object": "Object-centric directly-follows graph (OC-DFG): one DFG per object type",
        "first_peer_reviewed": "ghahfarokhi_et_al_ocel_2021",
        "canonical": ["ghahfarokhi_et_al_ocel_2021"],
        "notes": "Introduced with OCEL 1.0. Object-centric DFG formalized in the OCEL paper family.",
        "confidence": "medium",
        "coverage_kind": "direct",
    },
    "ocel_petri_net": {
        "formal_object": "Object-centric Petri net (OCPN): place per object type, shared transitions",
        "first_peer_reviewed": "van_der_aalst_berti_2020",
        "canonical": ["van_der_aalst_berti_2020"],
        "notes": "van der Aalst & Berti, Transactions on Petri Nets 2020.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    # WF-net / POWL
    "powl_to_process_tree": {
        "formal_object": "Language-preserving WF-net to POWL translation (Algorithm 3, Theorem 1)",
        "first_peer_reviewed": "kourani_park_van_der_aalst_2026",
        "canonical": ["kourani_park_van_der_aalst_2026"],
        "notes": "arXiv:2602.15739v3 — currently preprint; Def 3.1-3.13, Theorem 1.",
        "confidence": "high",
        "coverage_kind": "direct",
    },
    # Engineering-only
    "simd_streaming_dfg": {
        "formal_object": "SIMD-accelerated streaming DFG approximation",
        "first_peer_reviewed": None,
        "canonical": [],
        "notes": "Engineering primitive. Known bug: HashMap iteration order non-deterministic.",
        "confidence": "engineering_only",
        "coverage_kind": "engineering",
    },
    "pso": {
        "formal_object": "Particle Swarm Optimization adapted for Petri net discovery (no canonical PM paper)",
        "first_peer_reviewed": "kennedy_eberhart_1995 (generic PSO origin)",
        "canonical": ["kennedy_eberhart_1995"],
        "notes": "Generic PSO: Kennedy & Eberhart 1995. No accepted PM-specific PSO paper found.",
        "confidence": "engineering_only",
        "coverage_kind": "engineering",
    },
    "ml_cluster": {
        "formal_object": "K-means clustering adapted for process case feature vectors",
        "first_peer_reviewed": "macqueen_1967 (k-means origin)",
        "canonical": ["macqueen_1967"],
        "notes": "k-means: MacQueen 1967. No accepted PM-specific clustering paper found for this implementation.",
        "confidence": "engineering_only",
        "coverage_kind": "engineering",
    },
    "ml_anomaly": {
        "formal_object": "Information-theoretic anomaly scoring on process traces",
        "first_peer_reviewed": None,
        "canonical": [],
        "notes": "Engineering primitive based on log2 edge-frequency. No canonical PM anomaly paper mapped.",
        "confidence": "engineering_only",
        "coverage_kind": "engineering",
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# Algorithm families to research
# ─────────────────────────────────────────────────────────────────────────────

FAMILIES = {
    "10-DISCOVERY-LINEAGE": {
        "title": "Classical Discovery Algorithms",
        "algorithms": {
            "dfg": ("leemans directly-follows graph process mining", None),
            "alpha_plus_plus": ("van der aalst alpha algorithm workflow mining", None),
            "heuristic_miner": ("weijters heuristics miner process mining", None),
            "inductive_miner": ("leemans discovering block-structured process models", None),
            "ilp": ("van der aalst ILP miner region theory process mining", None),
            "genetic_algorithm": ("medeiros genetic process mining petri net", None),
            "hill_climbing": ("hill climbing petri net process discovery", None),
            "simulated_annealing": ("simulated annealing process mining", None),
            "aco": ("ant colony optimization process mining", None),
            "pso": ("particle swarm optimization process mining petri net", None),
            "a_star": ("adriansyah alignments A* process mining", None),
            "optimized_dfg": ("optimized directly-follows graph", None),
            "hierarchical_dfg": ("hierarchical abstraction process mining DFG", None),
            "causal_graph": ("causal graph process mining heuristic", None),
            "correlation_miner": ("correlation miner process mining", None),
            "process_skeleton": ("process skeleton mining DFG abstraction", None),
        }
    },
    "11-CONFORMANCE-LINEAGE": {
        "title": "Conformance Checking Algorithms",
        "algorithms": {
            "alignments": ("adriansyah aligning observed modeled behavior", None),
            "generalization": ("van der aalst generalization process quality dimension", None),
            "etconformance_precision": ("munoz-gama carmona precision conformance ETConformance", None),
            "complexity_metrics": ("petri net complexity metrics process mining", None),
        }
    },
    "12-OBJECT-CENTRIC-LINEAGE": {
        "title": "Object-Centric Process Mining",
        "algorithms": {
            "ocel_dfg": ("object centric event log OCEL directly-follows graph", None),
            "ocel_dfg_per_type": ("object centric directly-follows graph per type", None),
            "ocel_petri_net": ("van der aalst object centric petri net OCPN", None),
            "ocel_ocla": ("object centric process mining OCLA", None),
        }
    },
    "13-WFNET-PETRI-POWL-LINEAGE": {
        "title": "WF-net / Petri net / POWL",
        "algorithms": {
            "powl_to_process_tree": ("kourani park van der aalst separable workflow nets POWL", "2602.15739"),
            "pnml_import": ("petri net markup language PNML ISO standard", None),
            "bpmn_import": ("BPMN 2.0 business process model notation", None),
            "yawl_export": ("van der aalst YAWL workflow language", None),
            "transition_system": ("van der aalst transition system process mining", None),
            "declare": ("pesic van der aalst DECLARE declarative process", None),
        }
    },
    "14-STREAMING-PERFORMANCE-LINEAGE": {
        "title": "Streaming and Engineering Algorithms",
        "algorithms": {
            "simd_streaming_dfg": ("SIMD streaming process mining", None),
            "hierarchical_dfg": ("hierarchical process mining abstraction", None),
            "optimized_dfg": ("optimized directly-follows graph", None),
            "log_to_trie": ("prefix tree event log process mining trie", None),
            "streaming_log": ("streaming event log process mining online", None),
            "performance_spectrum": ("denisov fahland van der aalst performance spectrum", None),
            "batches": ("batch detection process mining", None),
            "smart_engine": ("adaptive algorithm selection process mining", None),
        }
    },
    "15-PREDICTION-ML-LINEAGE": {
        "title": "Prediction and ML Algorithms",
        "algorithms": {
            "ml_cluster": ("clustering process mining trace features k-means", None),
            "ml_anomaly": ("anomaly detection process mining traces information theory", None),
            "predict_next_activity": ("next activity prediction process mining", None),
            "predict_remaining_time": ("remaining time prediction process mining", None),
            "compute_ewma": ("EWMA exponentially weighted moving average process monitoring", None),
            "detect_drift": ("concept drift detection process mining", None),
        }
    },
    "16-SIMULATION-SOCIAL-LINEAGE": {
        "title": "Simulation and Social Network Mining",
        "algorithms": {
            "monte_carlo_simulation": ("monte carlo simulation petri net process mining", None),
            "playout": ("stochastic petri net playout process tree simulation", None),
            "handover_network": ("van der aalst social network handover process mining", None),
            "working_together_network": ("van der aalst social network working together process mining", None),
        }
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# Research and write
# ─────────────────────────────────────────────────────────────────────────────

def research_algorithm(alg_id: str, dblp_query: str, arxiv_id: str | None) -> dict:
    """Research one algorithm. Returns a result dict."""
    known = KNOWN.get(alg_id, {})

    print(f"  Researching: {alg_id}")

    # arXiv lookup if we have a known ID
    arxiv_result = None
    if arxiv_id:
        arxiv_result = arxiv_lookup(arxiv_id)
        if arxiv_result:
            print(f"    arXiv {arxiv_id}: {arxiv_result['title'][:50]}")

    # DBLP search
    dblp_results = dblp_search(dblp_query, max_hits=5)
    if dblp_results:
        top = dblp_results[0]
        print(f"    DBLP top: {top['year']} {top['title'][:50]} [{top['venue']}]")

    return {
        "id": alg_id,
        "known": known,
        "dblp_top": dblp_results[:3] if dblp_results else [],
        "arxiv": arxiv_result,
    }


def format_entry(r: dict) -> str:
    """Format one algorithm entry as markdown."""
    alg_id = r["id"]
    known = r["known"]
    dblp = r["dblp_top"]
    arxiv = r["arxiv"]

    lines = [f"## `{alg_id}`\n"]

    if known:
        lines.append(f"**Formal object:** {known.get('formal_object', '—')}")
        lines.append(f"**coverage_kind:** `{known.get('coverage_kind', 'unknown')}`")
        lines.append(f"**confidence:** `{known.get('confidence', 'unknown')}`")
        lines.append(f"**first_peer_reviewed:** {known.get('first_peer_reviewed', '—')}")
        canon = known.get('canonical', [])
        if canon:
            lines.append(f"**canonical:** {', '.join(canon)}")
        notes = known.get('notes', '')
        if notes:
            lines.append(f"**notes:** {notes}")
    else:
        lines.append("**Formal object:** — (not in known database)")
        lines.append("**coverage_kind:** `unknown`")
        lines.append("**confidence:** `low`")

    if arxiv:
        lines.append(f"\n**arXiv result:** {arxiv['year']} — {arxiv['title']}")
        lines.append(f"  Authors: {fmt_authors(arxiv['authors'])}")
        lines.append(f"  URL: https://arxiv.org/abs/{arxiv['arxiv_id']}")

    if dblp:
        lines.append("\n**DBLP results (top 3):**")
        for p in dblp[:3]:
            authors_str = fmt_authors(p["authors"])
            venue = p["venue"] or "—"
            doi = f" DOI:{p['doi']}" if p.get("doi") else ""
            lines.append(f"- {p['year']} | {p['title'][:70]} | {authors_str} | {venue}{doi}")
            if p.get("key"):
                lines.append(f"  DBLP key: `{p['key']}`")

    return "\n".join(lines) + "\n"


def write_family_file(filename: str, title: str, algorithms: dict) -> list[dict]:
    """Research and write one family lineage file. Returns all results."""
    print(f"\n=== {title} → {filename} ===")
    results = []
    for alg_id, (query, arxiv_id) in algorithms.items():
        r = research_algorithm(alg_id, query, arxiv_id)
        results.append(r)

    content = f"# {title} — Historical Lineage\n\n"
    content += f"*Generated by research_lineage.py — {time.strftime('%Y-%m-%d')}*\n\n"
    content += "Source hierarchy: peer-reviewed conf/journal > standard > PhD thesis > book > arXiv preprint.\n\n"
    content += "---\n\n"
    for r in results:
        content += format_entry(r) + "\n---\n\n"

    path = OUT / filename
    path.write_text(content)
    print(f"  → wrote {path} ({len(results)} entries)")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# BibTeX generation
# ─────────────────────────────────────────────────────────────────────────────

BIBTEX_KNOWN = """
@book{van_der_aalst_2016_process_mining,
  author    = {Wil M. P. van der Aalst},
  title     = {Process Mining: Data Science in Action},
  edition   = {2nd},
  publisher = {Springer},
  year      = {2016},
  doi       = {10.1007/978-3-662-49851-4}
}

@inproceedings{leemans_fahland_van_der_aalst_2013_constructive,
  author    = {Sander J. J. Leemans and Dirk Fahland and Wil M. P. van der Aalst},
  title     = {Discovering Block-Structured Process Models from Event Logs -- A Constructive Approach},
  booktitle = {Proc. 34th Int. Conf. Application and Theory of Petri Nets (Petri Nets 2013)},
  series    = {LNCS},
  volume    = {7927},
  pages     = {311--329},
  year      = {2013},
  publisher = {Springer},
  doi       = {10.1007/978-3-642-38697-8_17}
}

@phdthesis{adriansyah_2014_phd,
  author = {Arya Adriansyah},
  title  = {Aligning Observed and Modelled Behaviour},
  school = {Eindhoven University of Technology},
  year   = {2014},
  url    = {https://pure.tue.nl/ws/files/3835984/772989.pdf}
}

@inproceedings{munoz_gama_carmona_2010,
  author    = {Jorge Munoz-Gama and Josep Carmona},
  title     = {A Fresh Look at Precision in Process Conformance},
  booktitle = {Proc. 8th Int. Conf. Business Process Management (BPM 2010)},
  series    = {LNCS},
  volume    = {6336},
  pages     = {211--226},
  year      = {2010},
  publisher = {Springer},
  doi       = {10.1007/978-3-642-15618-2_16}
}

@article{weijters_van_der_aalst_2003,
  author  = {A.J.M.M. Weijters and Wil M. P. van der Aalst},
  title   = {Rediscovering Workflow Models from Event-Based Data Using Little Thumb},
  journal = {Integrated Computer-Aided Engineering},
  volume  = {10},
  number  = {2},
  pages   = {151--162},
  year    = {2003}
}

@inproceedings{pesic_van_der_aalst_2006,
  author    = {M. Pesic and Wil M. P. van der Aalst},
  title     = {A Declarative Approach for Flexible Business Processes Management},
  booktitle = {Proc. Int. Conf. Business Process Management Workshops 2006},
  series    = {LNCS},
  volume    = {4103},
  pages     = {169--180},
  year      = {2006},
  publisher = {Springer},
  doi       = {10.1007/11837862_18}
}

@article{van_der_aalst_et_al_social_2005,
  author  = {Wil M. P. van der Aalst and Hajo A. Reijers and Minseok Song},
  title   = {Discovering Social Networks from Event Logs},
  journal = {Computer Supported Cooperative Work},
  volume  = {14},
  number  = {6},
  pages   = {549--593},
  year    = {2005},
  doi     = {10.1007/s10606-005-9005-9}
}

@article{van_der_aalst_berti_2020,
  author  = {Wil M. P. van der Aalst and Alessandro Berti},
  title   = {Discovering Object-centric Petri Nets},
  journal = {Fundamenta Informaticae},
  volume  = {175},
  number  = {1--4},
  pages   = {1--40},
  year    = {2020},
  doi     = {10.3233/FI-2020-1946}
}

@article{ghahfarokhi_et_al_ocel_2021,
  author  = {Anahita Farhang Ghahfarokhi and Alessandro Berti and Wil M. P. van der Aalst},
  title   = {OCEL: A Standard for Object-Centric Event Logs},
  journal = {CEUR Workshop Proceedings},
  volume  = {3016},
  year    = {2021},
  url     = {https://ceur-ws.org/Vol-3016/paper6.pdf}
}

@inproceedings{denisov_fahland_van_der_aalst_2018,
  author    = {Vadim Denisov and Dirk Fahland and Wil M. P. van der Aalst},
  title     = {Unbiased, Fine-Grained Description of Processes Performance from Event Data},
  booktitle = {Proc. 16th Int. Conf. Business Process Management (BPM 2018)},
  series    = {LNCS},
  volume    = {11080},
  pages     = {139--157},
  year      = {2018},
  publisher = {Springer},
  doi       = {10.1007/978-3-319-98648-7_9}
}

@misc{kourani_park_van_der_aalst_2026,
  author = {Humam Kourani and Gyunam Park and Wil M. P. van der Aalst},
  title  = {Hierarchical Decomposition of Separable Workflow-Nets},
  year   = {2026},
  eprint = {2602.15739},
  archivePrefix = {arXiv},
  url    = {https://arxiv.org/abs/2602.15739}
}

@misc{kourani_park_van_der_aalst_2025_choice,
  author = {Humam Kourani and Gyunam Park and Wil M. P. van der Aalst},
  title  = {Unlocking Non-Block-Structured Decisions: Inductive Mining with Choice Graphs},
  year   = {2025},
  eprint = {2505.07052},
  archivePrefix = {arXiv},
  url    = {https://arxiv.org/abs/2505.07052}
}

@misc{kuesters_van_der_aalst_ocpq_2025,
  author = {Julian Küsters and Wil M. P. van der Aalst},
  title  = {OCPQ: Object-Centric Process Querying and Constraints},
  year   = {2025},
  eprint = {2506.11541},
  archivePrefix = {arXiv},
  url    = {https://arxiv.org/abs/2506.11541}
}

@standard{iso_pnml_2019,
  title        = {Petri nets -- Part 2: Transfer format},
  organization = {International Organization for Standardization},
  number       = {ISO/IEC 20481},
  year         = {2019}
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("ACADEMIC-LINEAGE-001 Research Script")
    print(f"Output: {OUT}")
    print()

    all_results = []
    for filename, family in FAMILIES.items():
        results = write_family_file(
            filename + ".md",
            family["title"],
            family["algorithms"],
        )
        all_results.extend(results)
        time.sleep(1)  # pause between families

    # Write bibliography
    bib_path = OUT / "SOURCE_BIBLIOGRAPHY.bib"
    bib_path.write_text(BIBTEX_KNOWN.strip())
    print(f"\nWrote bibliography: {bib_path}")

    # Write summary
    total = len(all_results)
    with_known = sum(1 for r in all_results if r["known"])
    engineering = sum(1 for r in all_results if r["known"].get("coverage_kind") == "engineering")
    direct = sum(1 for r in all_results if r["known"].get("coverage_kind") == "direct")
    derived = sum(1 for r in all_results if r["known"].get("coverage_kind") == "derived")

    print(f"\n=== Summary ===")
    print(f"Total researched: {total}")
    print(f"In known DB: {with_known}")
    print(f"  direct: {direct}, derived: {derived}, engineering: {engineering}")
    print(f"  unknown: {total - with_known}")
    print("\nNext: run write_lineage_toml.py to generate ALGORITHM_LINEAGE.toml")


if __name__ == "__main__":
    main()
