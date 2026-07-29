import init, { cognition_run } from 'wasm4pm-cognition-web';
import breeds from './breed-catalog.json';
import mycinFixture from './fixtures/mycin.json';
import bayesianNetworkFixture from './fixtures/bayesian_network.json';

const FIXTURES = { mycin: mycinFixture, bayesian_network: bayesianNetworkFixture };

const statusEl = document.getElementById('wasm-status');
const catalogEl = document.getElementById('catalog');
const breedCountEl = document.getElementById('breed-count');
const selectedEl = document.getElementById('selected-breed');
const runBtn = document.getElementById('run-btn');
const receiptEl = document.getElementById('receipt');

let selected = 'mycin';

function renderCatalog() {
  breedCountEl.textContent = String(breeds.length);
  catalogEl.innerHTML = breeds
    .map((id) => {
      const hasFixture = Boolean(FIXTURES[id]);
      return `<button class="breed-card${id === selected ? ' selected' : ''}"
        data-breed="${id}" ${hasFixture ? '' : 'disabled'}>${id}</button>`;
    })
    .join('');
  catalogEl.querySelectorAll('.breed-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.breed;
      selectedEl.textContent = selected;
      runBtn.disabled = !FIXTURES[selected];
      renderCatalog();
    });
  });
}

function renderReceipt(result) {
  receiptEl.classList.remove('hidden');
  document.getElementById('r-status').textContent = result.status;
  document.getElementById('r-breed').textContent = result.breed;
  document.getElementById('r-run-id').textContent = result.run_id;
  document.getElementById('r-output-hash').textContent = result.output_hash;
  document.getElementById('r-replay-pointer').textContent = result.replay_pointer;
  const kpisEl = document.getElementById('kpis');
  const conformance = result.conformance || {};
  const kpis = {
    fitness: conformance.fitness ?? 'n/a',
    model_id: conformance.model_id ?? 'n/a',
    options_profile: result.options_profile ?? 'default',
  };
  kpisEl.innerHTML = Object.entries(kpis)
    .map(([k, v]) => `<div class="kpi"><span class="kpi-key">${k}</span><span class="kpi-val">${v}</span></div>`)
    .join('');
}

async function main() {
  try {
    await init();
    statusEl.textContent = 'cognition WASM ready';
    statusEl.className = 'status ready';
    runBtn.disabled = !FIXTURES[selected];
  } catch (err) {
    statusEl.textContent = `WASM init failed: ${err}`;
    statusEl.className = 'status error';
    return;
  }

  renderCatalog();

  runBtn.addEventListener('click', () => {
    const fixture = FIXTURES[selected];
    if (!fixture) return;
    const requestJson = JSON.stringify({
      breed: fixture.breed,
      contract: fixture.input,
    });
    try {
      const raw = cognition_run(requestJson);
      const result = JSON.parse(raw);
      renderReceipt(result);
    } catch (err) {
      statusEl.textContent = `run failed: ${err}`;
      statusEl.className = 'status error';
    }
  });
}

main();
