#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/scripts/assemble.py"
pandoc "$ROOT/build/combined.md" --standalone --toc --toc-depth=2 --section-divs   --metadata title="Design for Combinatorial Maximalism using all Mermaid"   -c "$ROOT/scripts/print.css" -o "$ROOT/build/book.html"
weasyprint "$ROOT/build/book.html" "$ROOT/Design-for-Combinatorial-Maximalism-using-all-Mermaid.pdf"
