import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHACLValidator } from '../src/validate-shacl.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shapesPath = path.join(here, '..', 'semconv', 'chatman-equilibrium-standing-shapes.ttl');

function standing(overrides = {}) {
  return {
    schema: 'wasm4pm.chatman-equilibrium-standing/1',
    exact_subject: 'seanchatmangpt/wasm4pm@9fc4f1ae3cc99cf65a5f014580db8e1ea3d08b55',
    subject_binding: 'BOUND',
    state: 'Admitted',
    authority: 'NONE',
    do_authority: false,
    candidate_receipt_sha256: 'a'.repeat(64),
    doctor_report_hash: 'b'.repeat(64),
    replay_digest: 'c'.repeat(64),
    ...overrides,
  };
}

test('standing SHACL parses every repeated property block distinctly', async () => {
  const validator = await SHACLValidator.create(shapesPath);
  const shape = validator.shapes.find((candidate) => candidate.name === 'StandingReceiptShape');
  assert.ok(shape, 'StandingReceiptShape must be parsed');

  assert.deepEqual(
    shape.properties.map((property) => property.path),
    [
      'schema',
      'exactSubject',
      'subjectBinding',
      'state',
      'authority',
      'doAuthority',
      'candidateReceiptSha256',
      'doctorReportHash',
      'replayDigest',
    ],
  );
});

test('standing SHACL admits bounded receipt and kills authority laundering', async () => {
  const validator = await SHACLValidator.create(shapesPath);

  const admitted = await validator.validateResult('standing_receipt', standing());
  assert.equal(admitted.valid, true);

  const authority = await validator.validateResult(
    'standing_receipt',
    standing({ authority: 'DO' }),
  );
  assert.equal(authority.valid, false);
  assert.ok(authority.errors.some((error) => error.context?.field === 'authority'));

  const doAuthority = await validator.validateResult(
    'standing_receipt',
    standing({ do_authority: true }),
  );
  assert.equal(doAuthority.valid, false);
  assert.ok(doAuthority.errors.some((error) => error.context?.field === 'doAuthority'));
});

test('standing SHACL rejects missing exact subject and replay evidence', async () => {
  const validator = await SHACLValidator.create(shapesPath);
  const candidate = standing();
  delete candidate.exact_subject;
  delete candidate.replay_digest;

  const report = await validator.validateResult('standing_receipt', candidate);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.context?.field === 'exactSubject'));
  assert.ok(report.errors.some((error) => error.context?.field === 'replayDigest'));
});


test('standing SHACL rejects invented states mutable subjects and malformed digests', async () => {
  const validator = await SHACLValidator.create(shapesPath);

  for (const [field, value] of [
    ['state', 'Maybe'],
    ['subject_binding', 'TRUST_ME'],
    ['exact_subject', 'seanchatmangpt/wasm4pm@main'],
    ['candidate_receipt_sha256', 'abc'],
    ['doctor_report_hash', 'G'.repeat(64)],
    ['replay_digest', '0'.repeat(63)],
  ]) {
    const report = await validator.validateResult(
      'standing_receipt',
      standing({ [field]: value }),
    );
    assert.equal(report.valid, false, `${field} mutant must be rejected`);
  }
});
