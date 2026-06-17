import { runContract } from '@wasm4pm/cognition';

async function test() {
  console.log("Running contract...");
  const result = await runContract('dfg', {
    intent: {
      domain: 'discovery',
      target: 'dfg'
    },
    facts: {
      log: [
        {
          trace_id: "t1",
          events: [
            { activity: "A", timestamp: "2023-01-01T10:00:00Z" }
          ]
        }
      ]
    }
  }, { profile: 'test' });
  
  console.log("Result:");
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
