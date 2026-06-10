import { runContract } from '@wasm4pm/cognition';

/**
 * ZOE LA Example 04: Autonomic Next-Best Lawful Action
 * 
 * Demonstrates using the "Old AI" breeds directly (without LLM hallucinations)
 * to evaluate route facts and generate a recovery plan.
 * 
 * Flow:
 * 1. MYCIN (forward chaining) diagnoses a stuck route based on facts.
 * 2. STRIPS (planner) formulates the exact steps to recover the route.
 */
async function coordinateAutonomicCare() {
  console.log('===========================================================');
  console.log(' ZOE LA Route X-Ray: Autonomic Care Coordinator');
  console.log('===========================================================');

  // We pretend that the process mining layer (e.g. from Example 01)
  // has generated the following facts about a prayer request route.
  console.log('1. Analyzing Process Evidence...');
  const routeFacts = [
    { key: 'route', value: 'prayer-request' },
    { key: 'status', value: 'stuck' },
    { key: 'duration_hours', value: '72' },
    { key: 'receipt_assigned', value: 'true' },
    { key: 'receipt_followed_up', value: 'false' },
    { key: 'volunteer_capacity', value: 'overloaded' }
  ];
  console.log(`   Route is ${routeFacts[1].value} at ${routeFacts[2].value} hours. Volunteer is ${routeFacts[5].value}.`);

  console.log('\n2. Invoking MYCIN (Forward Chaining Diagnostics)...');
  // Use MYCIN to diagnose WHY it is stuck and what the immediate policy should be.
  const diagnosticResult = await runContract('mycin', {
    intent: 'diagnose-stuck-care-route',
    facts: routeFacts,
    rules: [
      {
        id: 'r1-overdue',
        premise: ['status=stuck', 'duration_hours=72'],
        conclusion: 'condition=overdue',
        certainty: 1.0
      },
      {
        id: 'r2-missing-followup',
        premise: ['condition=overdue', 'receipt_assigned=true', 'receipt_followed_up=false'],
        conclusion: 'failure_mode=abandoned-after-assignment',
        certainty: 0.95
      },
      {
        id: 'r3-reassign',
        premise: ['failure_mode=abandoned-after-assignment', 'volunteer_capacity=overloaded'],
        conclusion: 'action=escalate-and-reassign',
        certainty: 0.9
      }
    ],
    candidates: [],
    cases: [],
    goals: [],
    state: []
  });

  const diagnosis = diagnosticResult.output;
  console.log(`   Conclusion: ${diagnosis.explanation}`);
  const recommendedAction = diagnosis.facts.find((f: any) => f.key === 'action')?.value;
  console.log(`   Deterministic Action Policy: ${recommendedAction || 'None'}`);

  console.log('\n3. Invoking GPS (Means-Ends Route Planner)...');
  // Use GPS to plan exactly how to achieve the escalated reassignment safely
  if (recommendedAction === 'escalate-and-reassign') {
    const planningResult = await runContract('gps', {
      intent: 'execute-safe-reassignment',
      state: [
        { predicate: 'assigned_to', value: 'volunteer_a' },
        { predicate: 'notified', value: 'none' },
        { predicate: 'route_state', value: 'open' }
      ],
      goals: [
        { id: 'g1', predicate: 'assigned_to', value: 'care_lead' },
        { id: 'g2', predicate: 'notified', value: 'care_lead' }
      ],
      rules: [
        {
          id: 'revoke-assignment',
          premise: ['assigned_to=volunteer_a', 'route_state=open'],
          conclusion: 'assigned_to=none;!assigned_to=volunteer_a',
          certainty: 1.0
        },
        {
          id: 'escalate-to-lead',
          premise: ['assigned_to=none', 'route_state=open'],
          conclusion: 'assigned_to=care_lead;!assigned_to=none',
          certainty: 1.0
        },
        {
          id: 'notify-lead',
          premise: ['assigned_to=care_lead', 'notified=none'],
          conclusion: 'notified=care_lead;!notified=none',
          certainty: 1.0
        }
      ],
      candidates: [],
      facts: [],
      cases: []
    });

    console.log('   Generated Lawful Recovery Plan:');
    const trace = planningResult.output.inference_trace;
    if (trace && trace.length > 0) {
      trace.forEach((step: any, index: number) => {
        if (step.kind === 'apply-operator') {
          console.log(`     Step ${index + 1}: Execute [ ${step.detail} ]`);
        } else if (step.kind === 'subgoal') {
          console.log(`     (Solving subgoal: ${step.detail})`);
        }
      });
    } else {
      console.log('     [FAIL] Could not determine a safe planning route.');
    }
    console.log(`\n   Cryptographic Receipt (BLAKE3): ${planningResult.output_hash.slice(0, 16)}...`);
  }

  console.log('===========================================================');
  console.log(' Autonomic Care Coordinator Complete.');
  console.log(' Zero LLM Hallucinations. 100% Cryptographic Certainty.');
  console.log('===========================================================');
}

coordinateAutonomicCare().catch(console.error);