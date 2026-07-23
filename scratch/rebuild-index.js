const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const repDir = path.join(rootDir, 'reports/capability-validation');
const algDir = path.join(repDir, 'algorithms');
const brDir = path.join(repDir, 'breeds');

function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---([\s\S]+?)---/);
  if (!match) return null;
  const lines = match[1].split('\n');
  const fm = {};
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join(':').trim();
      fm[key] = val;
    }
  }
  return fm;
}

const algFiles = fs.readdirSync(algDir).filter(f => f.endsWith('.md')).sort();
const brFiles = fs.readdirSync(brDir).filter(f => f.endsWith('.md')).sort();

const indexRows = [];

for (const f of algFiles) {
  const filePath = path.join(algDir, f);
  const fm = parseFrontmatter(filePath);
  if (!fm) continue;
  
  const numStr = fm.number || f.slice(0, 3);
  const implFile = fm.implementation_file || 'MISSING';
  const testFile = fm.test_file || 'MISSING';
  const receipt = fm.receipt || 'MISSING';
  
  indexRows.push(`| ${numStr} | algorithm | ${fm.id} | [${f}](file://${filePath}) | ${fm.final_status} | ${fm.maturity_level} | [${path.basename(implFile)}](file://${path.resolve(implFile)})#L1 | [${path.basename(testFile)}](file://${path.resolve(testFile)})#L1 | [${path.basename(receipt)}](file://${path.resolve(receipt)}) |`);
}

for (const f of brFiles) {
  const filePath = path.join(brDir, f);
  const fm = parseFrontmatter(filePath);
  if (!fm) continue;
  
  const numStr = fm.number || f.slice(0, 3);
  const implFile = fm.implementation_file || 'MISSING';
  const testFile = fm.test_file || 'MISSING';
  const receipt = fm.receipt || 'MISSING';
  
  indexRows.push(`| ${numStr} | breed | ${fm.id} | [${f}](file://${filePath}) | ${fm.final_status} | ${fm.maturity_level} | [${path.basename(implFile)}](file://${path.resolve(implFile)})#L1 | [${path.basename(testFile)}](file://${path.resolve(testFile)})#L1 | [${path.basename(receipt)}](file://${path.resolve(receipt)}) |`);
}

let indexContent = `# Master Report Index\n\n`;
indexContent += `This index catalogs all 115 capability reports, linking them to their source files, implementations, tests, and receipts.\n\n`;
indexContent += `| # | Type | ID | Report File | Final Status | L-Level | Implementation | Test | Receipt |\n`;
indexContent += `|---:|---|---|---|---|---|---|---|---|\n`;
indexContent += indexRows.join('\n') + '\n';

fs.writeFileSync(path.join(repDir, 'REPORT_INDEX.md'), indexContent);
console.log('Index rebuilt successfully!');
