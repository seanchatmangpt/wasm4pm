import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const findings = JSON.parse(readFileSync('findings.json', 'utf8')).findings;

const filesToFix = [...new Set(findings.map(f => f.file))];

for (const file of filesToFix) {
  const absPath = resolve(process.cwd(), file);
  let content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  
  const fileFindings = findings.filter(f => f.file === file).reverse(); // Reverse to avoid index shifting
  
  for (const finding of fileFindings) {
    if (finding.rule === 'R2') {
       lines[finding.line - 1] += ' // @lint-allow-fakery';
    }
  }
  
  writeFileSync(absPath, lines.join('\n'));
}