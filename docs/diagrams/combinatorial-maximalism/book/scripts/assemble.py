from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
src=root/"src"
out=root/"build"
out.mkdir(exist_ok=True)
summary=(src/"SUMMARY.md").read_text()
paths=re.findall(r"\[[^\]]+\]\(([^)]+\.md)\)", summary)
parts=[]
pdf_paths=[p for p in paths if p != 'title-page.md']
for i, rel in enumerate(pdf_paths):
    text=(src/rel).read_text()
    if i:
        parts.append("<div class=\"page-break\"></div>")
    parts.append(text)
(out/"combined.md").write_text("\n\n".join(parts))
