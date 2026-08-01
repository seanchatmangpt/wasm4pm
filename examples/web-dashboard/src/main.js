import initCognition, { cognition_run } from "wasm4pm-cognition-web";
import breedCatalog from "./breed-catalog.json";
import mycinFixture from "./fixtures/mycin.json";
import bayesianFixture from "./fixtures/bayesian_network.json";

const fixtures = new Map([
  [mycinFixture.breed, mycinFixture],
  [bayesianFixture.breed, bayesianFixture],
]);

const elements = {
  status: document.querySelector("#wasm-status"),
  breedCount: document.querySelector("#breed-count"),
  catalog: document.querySelector("#catalog"),
  selectedBreed: document.querySelector("#selected-breed"),
  runButton: document.querySelector("#run-btn"),
  receipt: document.querySelector("#receipt"),
  receiptStatus: document.querySelector("#r-status"),
  receiptBreed: document.querySelector("#r-breed"),
  runId: document.querySelector("#r-run-id"),
  outputHash: document.querySelector("#r-output-hash"),
  replayPointer: document.querySelector("#r-replay-pointer"),
  kpis: document.querySelector("#kpis"),
};

let selectedBreed = "mycin";
let wasmReady = false;

function requireElement(name, element) {
  if (!element) {
    throw new Error(`Dashboard element is missing: ${name}`);
  }
  return element;
}

for (const [name, element] of Object.entries(elements)) {
  requireElement(name, element);
}

function setStatus(state, message) {
  elements.status.className = `status ${state}`;
  elements.status.textContent = message;
}

function selectBreed(breed) {
  if (!fixtures.has(breed)) return;

  selectedBreed = breed;
  elements.selectedBreed.textContent = breed;
  elements.runButton.disabled = !wasmReady;

  for (const card of elements.catalog.querySelectorAll(".card")) {
    card.classList.toggle("selected", card.dataset.breed === breed);
  }
}

function renderCatalog() {
  elements.breedCount.textContent = String(breedCatalog.length);
  elements.catalog.replaceChildren();

  for (const breed of breedCatalog) {
    const hasFixture = fixtures.has(breed);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `card${hasFixture ? " has-fixture" : " disabled"}`;
    card.dataset.breed = breed;
    card.textContent = breed;
    card.disabled = !hasFixture;
    card.setAttribute(
      "aria-label",
      hasFixture ? `Select ${breed}` : `${breed} has no bundled fixture`,
    );
    card.addEventListener("click", () => selectBreed(breed));
    elements.catalog.append(card);
  }

  selectBreed(selectedBreed);
}

function primitiveLeaves(value, path = "output", leaves = []) {
  if (leaves.length >= 16 || value === null || value === undefined) {
    return leaves;
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    leaves.push({ path, value });
    return leaves;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => primitiveLeaves(item, `${path}[${index}]`, leaves));
    return leaves;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      primitiveLeaves(item, `${path}.${key}`, leaves),
    );
  }

  return leaves;
}

function formatValue(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toPrecision(8);
  }
  return String(value);
}

function renderKpis(result) {
  const leaves = primitiveLeaves(result.output);

  if (typeof result.conformance?.fitness === "number") {
    leaves.unshift({
      path: "conformance.fitness",
      value: result.conformance.fitness,
    });
  }

  elements.kpis.replaceChildren();

  if (leaves.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "The run completed without scalar output values.";
    elements.kpis.append(empty);
    return;
  }

  for (const leaf of leaves.slice(0, 12)) {
    const item = document.createElement("div");
    item.className = "kpi";

    const value = document.createElement("div");
    value.className = "val";
    value.textContent = formatValue(leaf.value);

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = leaf.path;

    const trace = document.createElement("div");
    trace.className = "trace mono";
    trace.textContent = `output_hash ${result.output_hash}`;

    item.append(value, label, trace);
    elements.kpis.append(item);
  }
}

function renderReceipt(result) {
  elements.receiptStatus.textContent = result.status ?? "unknown";
  elements.receiptBreed.textContent = result.breed ?? selectedBreed;
  elements.runId.textContent = result.run_id ?? "missing";
  elements.outputHash.textContent = result.output_hash ?? "missing";
  elements.replayPointer.textContent = result.replay_pointer ?? "missing";
  renderKpis(result);
  elements.receipt.classList.remove("hidden");
}

async function runSelectedBreed() {
  const fixture = fixtures.get(selectedBreed);
  if (!fixture || !wasmReady) return;

  elements.runButton.disabled = true;
  elements.runButton.textContent = "Running…";

  try {
    const request = {
      breed: fixture.breed,
      contract: fixture.input,
      options: { profile: "browser-dashboard" },
    };
    const encoded = cognition_run(JSON.stringify(request));
    const result = typeof encoded === "string" ? JSON.parse(encoded) : encoded;

    if (result?.status !== "ok") {
      throw new Error(result?.error ?? `Unexpected run status: ${result?.status}`);
    }

    renderReceipt(result);
  } catch (error) {
    console.error(error);
    setStatus("error", `run failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    elements.runButton.textContent = "Run breed";
    elements.runButton.disabled = !wasmReady;
  }
}

elements.runButton.addEventListener("click", runSelectedBreed);
renderCatalog();

try {
  await initCognition();
  wasmReady = true;
  setStatus("ready", "cognition WASM ready · execution remains in this tab");
  selectBreed(selectedBreed);
} catch (error) {
  console.error(error);
  setStatus(
    "error",
    `WASM initialization failed: ${error instanceof Error ? error.message : error}`,
  );
}
