import { defineCommand } from 'citty';
import { doctor } from './receipt/doctor.js';
import { verifyOcel2 } from './receipt/verify-ocel2.js';
import { detectFixtureMutation } from './receipt/detect-fixture-mutation.js';
import { verifyBoundaryEvidence } from './receipt/verify-boundary-evidence.js';
import { verifyProofClass } from './receipt/verify-proof-class.js';
import { verifyChallenge } from './receipt/verify-challenge.js';
import { canonicalizeOcel2 } from './receipt/canonicalize-ocel2.js';
import { producerSafeReport } from './receipt/producer-safe-report.js';
import { operatorPrivateReport } from './receipt/operator-private-report.js';
import { truthforge } from './receipt/truthforge.js';
import { show } from './receipt/show.js';
import { keygen } from './receipt/keygen.js';
import { mintNonce } from './receipt/mint-nonce.js';
import { admit } from './receipt/admit.js';
import { verifyChain } from './receipt/verify-chain.js';
import { residuals } from './receipt/residuals.js';

export const receipt = defineCommand({
  meta: {
    name: 'receipt',
    description: 'Adversarial receipt truth verification, chain visualization, and ingress gates',
  },
  subCommands: {
    show,
    doctor,
    'verify-ocel2': verifyOcel2,
    'detect-fixture-mutation': detectFixtureMutation,
    'verify-boundary-evidence': verifyBoundaryEvidence,
    'verify-proof-class': verifyProofClass,
    'verify-challenge': verifyChallenge,
    'canonicalize-ocel2': canonicalizeOcel2,
    'producer-safe-report': producerSafeReport,
    'operator-private-report': operatorPrivateReport,
    'truthforge': truthforge,
    keygen,
    'mint-nonce': mintNonce,
    admit,
    'verify-chain': verifyChain,
    residuals,
  },
});
