from pathlib import Path
import re, hashlib, sys, json
root=Path(__file__).resolve().parents[1]
src=root/'src'
errors=[]
summary=(src/'SUMMARY.md').read_text()
links=re.findall(r'\[[^\]]+\]\(([^)]+)\)',summary)
md=[x for x in links if x.endswith('.md')]
for rel in md:
    if not (src/rel).exists(): errors.append(f'missing summary target: {rel}')
patterns=list((src/'patterns').glob('*.md'))
diagrams=list((src/'diagrams').glob('*.mmd'))
if len(patterns)!=34: errors.append(f'expected 34 pattern chapters, got {len(patterns)}')
if len(diagrams)!=34: errors.append(f'expected 34 diagrams, got {len(diagrams)}')
for p in patterns:
    text=p.read_text()
    m=re.search(r'```mermaid\n(.*?)\n```',text,re.S)
    if not m: errors.append(f'no mermaid block: {p.name}'); continue
    d=src/'diagrams'/(p.stem+'.mmd')
    if not d.exists(): errors.append(f'no standalone diagram: {p.stem}')
    elif m.group(1).strip()!=d.read_text().strip(): errors.append(f'diagram drift: {p.stem}')
for rel in links:
    if rel.endswith('.mmd') and not (src/rel).exists(): errors.append(f'missing source link: {rel}')
pdf=root/'Design-for-Combinatorial-Maximalism-using-all-Mermaid.pdf'
if not pdf.exists() or pdf.stat().st_size<100000: errors.append('PDF missing or unexpectedly small')
report={
 'summary_markdown_targets':len(md),
 'pattern_chapters':len(patterns),
 'mermaid_sources':len(diagrams),
 'pdf_bytes':pdf.stat().st_size if pdf.exists() else 0,
 'pdf_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest() if pdf.exists() else None,
 'errors':errors,
}
(root/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if errors: sys.exit(1)
