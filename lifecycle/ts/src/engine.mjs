/**
 * LifecycleEngine — orchestrates the wasm4pm × unrdf development lifecycle.
 *
 * Fully standalone — zero external dependencies. Uses Node.js built-ins only
 * (crypto.randomUUID, crypto.subtle for SHA-256 receipts).
 *
 * Each stage transition:
 *   1. Validates the guard condition against the declared transition table
 *   2. Records a XES event in the in-memory event log
 *   3. Returns a SHA-256 receipt over the event payload
 */

import { isValidTransition, STAGES } from './index.mjs';
import { toXesEvent } from './xes.mjs';

export class LifecycleEngine {
  #caseId;
  #currentStage;
  #events;

  constructor({ caseId = crypto.randomUUID(), initialStage = 'Spec' } = {}) {
    this.#caseId = caseId;
    this.#currentStage = initialStage;
    this.#events = [];
  }

  get currentStage() { return this.#currentStage; }
  get caseId()       { return this.#caseId; }

  /**
   * Advance the lifecycle from the current stage to `toStage`.
   *
   * @param {string} toStage - Target stage name (e.g. 'Generate')
   * @param {object} [meta]  - Optional metadata stored in the XES event
   * @returns {{ receipt: object, event: object }}
   */
  async transition(toStage, meta = {}) {
    if (!isValidTransition(this.#currentStage, toStage)) {
      throw new Error(
        `Invalid lifecycle transition: ${this.#currentStage} → ${toStage}. ` +
        `See schema/domain.ttl for declared transitions.`
      );
    }

    const stageInfo = STAGES[toStage];
    const event = {
      caseId:    this.#caseId,
      activity:  stageInfo.xesActivity,
      timestamp: new Date().toISOString(),
      index:     this.#events.length + 1,
      from:      this.#currentStage,
      to:        toStage,
      meta,
    };

    this.#events.push(toXesEvent(event));

    const receipt = await makeReceipt(event);
    this.#currentStage = toStage;
    return { receipt, event };
  }

  /** Returns the flat event log sorted by index. */
  get eventLog() {
    return [...this.#events].sort((a, b) => a.index - b.index);
  }

  /** Returns events grouped by caseId. */
  get traces() {
    return { [this.#caseId]: this.eventLog };
  }

  /** Returns activity sequences — direct input to DFG discovery. */
  get activitySequences() {
    return [this.eventLog.map(e => e.activity)];
  }
}

// ─── receipt (SHA-256, no external dep) ──────────────────────────────────────

async function makeReceipt(event) {
  const payload = JSON.stringify(event);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { operationId: crypto.randomUUID(), timestamp: event.timestamp, hash, payload };
}
