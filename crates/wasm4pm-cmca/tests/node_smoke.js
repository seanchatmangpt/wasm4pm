const assert = require('node:assert/strict');
const cmca = require('../pkg/wasm4pm_cmca.js');

const contract = JSON.parse(cmca.cmcaContract());
assert.equal(contract.schema, 'wasm4pm.cmca-allocation/v1');
assert.equal(contract.bcinr_source_sha, 'b76dcb377b297cb8826a5256b55f8b57a6b76462');
assert.equal(contract.package, 'bcinr-cmca');
assert.equal(contract.version, '26.7.28');
assert.equal(contract.authority, 'CONSTRUCT_ONLY');
assert.equal(contract.actuation_performed, false);
assert.deepEqual(contract.shape, { n: 8, f: 10, k: 4, q: 4 });

const request = {
  states: Array.from({ length: 8 }, (_, id) => ({
    id,
    factors_q16: Array(10).fill(65536),
  })),
  lenses: [
    { id: 0, q_q16: 131072 },
    { id: 1, q_q16: 65536 },
    { id: 2, q_q16: 0 },
    { id: 3, q_q16: -65536 },
  ],
  measure: 0,
  lens_index: 1,
  parent: Array(8).fill(-1),
  weights_q16: Array.from({ length: 8 }, () => Array(8).fill(65536)),
};

const response = cmca.cmcaAllocate(request);
const replayVerified = cmca.cmcaReplay(response);
assert.equal(response.standing, 'ALIVE');
assert.equal(response.receipt.bcinr_source_sha, contract.bcinr_source_sha);
assert.equal(response.receipt.authority, 'CONSTRUCT_ONLY');
assert.equal(response.receipt.actuation_performed, false);
assert.equal(response.receipt.bcinr_package, 'bcinr-cmca');
assert.ok(response.receipt.request_blake3.length > 0);
assert.ok(response.receipt.result_blake3.length > 0);
assert.ok(response.receipt.receipt_blake3.length > 0);
assert.equal(response.result.shares_q16.length, 8);
assert.ok(response.result.shares_q16.some((value) => value > 0));
assert.equal(replayVerified, true);

process.stdout.write(JSON.stringify({ request, contract, response, replay_verified: replayVerified }, null, 2));
process.stdout.write('\n');
