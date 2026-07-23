const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tests = [
  { id: 'predict_remaining_time', name: 'predict_remaining_time_paper_grounded' },
  { id: 'automl_classify', name: 'automl_classify_paper_grounded' },
  { id: 'automl_forecast', name: 'automl_forecast_paper_grounded' },
  { id: 'ml_anomaly', name: 'ml_anomaly_paper_grounded' },
  { id: 'ml_classify', name: 'ml_classify_paper_grounded' },
  { id: 'ml_cluster', name: 'ml_cluster_paper_grounded' },
  { id: 'ml_forecast', name: 'ml_forecast_paper_grounded' },
  { id: 'ml_pca', name: 'ml_pca_paper_grounded' },
  { id: 'ml_regress', name: 'ml_regress_paper_grounded' },
  { id: 'handover_network', name: 'handover_network_paper_grounded' },
  { id: 'working_together_network', name: 'working_together_network_paper_grounded' },
  { id: 'agentic_pipeline', name: 'agentic_pipeline_paper_grounded' },
];

const verifierDir = path.resolve(__dirname, '../reports/capability-validation/verifier');
if (!fs.existsSync(verifierDir)) {
  fs.mkdirSync(verifierDir, { recursive: true });
}

for (const t of tests) {
  console.log(`Running ${t.name}...`);
  try {
    const output = execSync(`cargo test --test algorithm_paper_grounded -- ${t.name}`, {
      cwd: path.resolve(__dirname, '../wasm4pm'),
      encoding: 'utf8'
    });
    fs.writeFileSync(path.join(verifierDir, `${t.id}_test.log`), output);
    console.log(`Saved ${t.id}_test.log`);
  } catch (err) {
    console.error(`Failed ${t.name}:`, err.message);
    if (err.stdout) {
      fs.writeFileSync(path.join(verifierDir, `${t.id}_test.log`), err.stdout);
      console.log(`Saved stdout (with errors) to ${t.id}_test.log`);
    }
  }
}
console.log('All tests completed.');
