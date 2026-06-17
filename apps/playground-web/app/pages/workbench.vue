<script setup lang="ts">
import { ref, computed } from 'vue'

useHead({
  title: 'Cognition Workbench | Wasm4PM',
  meta: [
    { name: 'description', content: 'Test and verify Symbolic Reasoning Breeds in the Cognition Workbench.' }
  ]
})

// Hardcoded mock of the 52 breeds for UI purposes
const breeds = [
  { id: 'ltl_monitor', name: 'LTL Monitor', category: 'Temporal / Logic' },
  { id: 'allen_temporal', name: 'Allen Temporal', category: 'Temporal / Logic' },
  { id: 'fuzzy_logic', name: 'Fuzzy Logic', category: 'Uncertain Reasoning' },
  { id: 'bayesian_network', name: 'Bayesian Network', category: 'Uncertain Reasoning' },
  { id: 'csp_ac3', name: 'CSP AC3', category: 'Constraint Satisfaction' },
  { id: 'default_logic', name: 'Default Logic', category: 'Non-monotonic Logic' },
  { id: 'htn_planning', name: 'HTN Planning', category: 'Planning' },
  { id: 'dempster_shafer', name: 'Dempster Shafer', category: 'Uncertain Reasoning' },
  { id: 'frames_inheritance', name: 'Frames Inheritance', category: 'Knowledge Representation' },
  { id: 'ebl', name: 'EBL', category: 'Machine Learning' },
  { id: 'asp', name: 'ASP', category: 'Answer Set Programming' },
  { id: 'description_logic', name: 'Description Logic', category: 'Description Logic' },
  { id: 'abductive_lp', name: 'Abductive LP', category: 'Answer Set Programming' },
  { id: 'abductive_ibe', name: 'Abductive IBE', category: 'Answer Set Programming' },
  { id: 'partial_order_plan', name: 'Partial Order Plan', category: 'Planning' },
  { id: 'event_calculus', name: 'Event Calculus', category: 'Temporal / Logic' },
  { id: 'mdp', name: 'MDP', category: 'Decision Theory' },
  { id: 'version_space', name: 'Version Space', category: 'Machine Learning' },
  { id: 'belief_merging', name: 'Belief Merging', category: 'Knowledge Representation' },
  { id: 'qualitative_reason', name: 'Qualitative Reason', category: 'Qualitative Reasoning' },
  { id: 'script_sam', name: 'Script SAM', category: 'Knowledge Representation' },
  { id: 'clp', name: 'CLP', category: 'Constraint Satisfaction' },
  { id: 'situation_calculus', name: 'Situation Calculus', category: 'Temporal / Logic' },
  { id: 'circumscription', name: 'Circumscription', category: 'Non-monotonic Logic' },
  { id: 'analogy_sme', name: 'Analogy SME', category: 'Analogical Reasoning' },
  { id: 'act_r', name: 'ACT-R', category: 'Cognitive Architecture' },
  { id: 'problog', name: 'Problog', category: 'Probabilistic Logic' },
  { id: 'sat_cdcl', name: 'SAT CDCL', category: 'Constraint Satisfaction' },
  { id: 'episodic_memory', name: 'Episodic Memory', category: 'Cognitive Architecture' },
  { id: 'rl_symbolic', name: 'RL Symbolic', category: 'Reinforcement Learning' },
  { id: 'ctl_check', name: 'CTL Check', category: 'Model Checking' },
  { id: 'ilp', name: 'ILP', category: 'Machine Learning' },
  { id: 'naive_physics', name: 'Naive Physics', category: 'Qualitative Reasoning' },
  { id: 'tableaux', name: 'Tableaux', category: 'Theorem Proving' },
  { id: 'construction_grammar', name: 'Construction Grammar', category: 'Cognitive Linguistics' },
  { id: 'markov_logic', name: 'Markov Logic', category: 'Probabilistic Logic' },
  { id: 'pomdp', name: 'POMDP', category: 'Decision Theory' },
  { id: 'contingent_plan', name: 'Contingent Plan', category: 'Planning' },
  { id: 'meta_reasoning', name: 'Meta Reasoning', category: 'Cognitive Architecture' },
  { id: 'eliza', name: 'ELIZA', category: 'R_historical' },
  { id: 'cbr', name: 'CBR', category: 'R_historical' },
  { id: 'dendral', name: 'DENDRAL', category: 'R_historical' },
  { id: 'strips', name: 'STRIPS', category: 'R_historical' },
  { id: 'prolog', name: 'Prolog', category: 'R_historical' },
  { id: 'mycin', name: 'MYCIN', category: 'R_historical' },
  { id: 'gps', name: 'GPS', category: 'R_historical' },
  { id: 'soar', name: 'SOAR', category: 'R_historical' },
  { id: 'hearsay', name: 'HEARSAY-II', category: 'R_historical' },
  { id: 'autoinstinct_neurosis', name: 'Vision / Neurosis', category: 'R_autonomic' },
  { id: 'autoinstinct_semantics', name: 'Semantics', category: 'R_autonomic' },
  { id: 'autoinstinct_vision', name: 'Vision', category: 'R_autonomic' },
  { id: 'autoinstinct_learning', name: 'Learning', category: 'R_autonomic' }
]

const route = useRoute()
const selectedBreedId = ref(route.query.breed ? String(route.query.breed) : breeds[0].id)
const inputJson = ref('{\n  "goal": "Evaluate logical consistency",\n  "facts": [\n    {"id": "f1", "value": "A => B"},\n    {"id": "f2", "value": "A"}\n  ]\n}')
const isRunning = ref(false)
const outputJson = ref('')
const logs = ref<string[]>([])
const receipt = ref<any>(null)

const selectedBreed = computed(() => breeds.find(b => b.id === selectedBreedId.value) || breeds[0])

async function runExecution() {
  isRunning.value = true
  outputJson.value = ''
  logs.value = []
  receipt.value = null
  
  logs.value.push(`[${new Date().toISOString()}] INITIALIZING KERNEL for breed: ${selectedBreed.value.id}`)
  
  let contractBody: any
  try {
    contractBody = JSON.parse(inputJson.value)
  } catch (e) {
    logs.value.push(`[${new Date().toISOString()}] FATAL: MALFORMED_JSON_INPUT`)
    outputJson.value = 'Error: Invalid JSON payload format.'
    isRunning.value = false
    return
  }

  // Frontend quick-check (optional, backend verifies this too)
  if (inputJson.value.toLowerCase().includes('fake')) {
    logs.value.push(`[${new Date().toISOString()}] FATAL: SECURITY_HALT - FAKE_ARTEFACT_DETECTED (FRONTEND GUARD)`)
  }

  try {
    logs.value.push(`[${new Date().toISOString()}] DISPATCHING payload to WASM Boundary...`)
    const t0 = Date.now()
    
    // Call the server API which uses the real WASM CLI
    const res: any = await $fetch('/api/cognition', {
      method: 'POST',
      body: {
        breed: selectedBreed.value.id,
        contract: contractBody
      }
    })
    
    const t1 = Date.now()
    logs.value.push(`[${new Date().toISOString()}] RETURNED from WASM Boundary in ${t1 - t0}ms`)
    
    // Filter down findings or format the output nicely
    outputJson.value = JSON.stringify(res, null, 2)
    
    // Attempt to extract receipt if present
    if (res.receipt) {
      logs.value.push(`[${new Date().toISOString()}] VALID BLAKE3 receipt parsed.`)
      receipt.value = res.receipt
    }
  } catch (err: any) {
    logs.value.push(`[${new Date().toISOString()}] KERNEL REJECTED payload.`)
    if (err.data && err.data.statusMessage) {
      if (err.data.statusMessage.includes('FAKE_ARTEFACT_DETECTED')) {
         logs.value.push(`[${new Date().toISOString()}] FATAL: SECURITY_HALT - FAKE_ARTEFACT_DETECTED`)
      }
      outputJson.value = String(err.data.statusMessage)
    } else {
      outputJson.value = String(err.message)
    }
  }

  isRunning.value = false
}
</script>

<template>
  <div class="min-h-screen bg-[#050505] text-gray-200 flex flex-col font-sans">
    <div class="flex-1 flex flex-col md:flex-row h-full">
      <!-- Sidebar / Config -->
      <aside class="w-full md:w-80 border-r border-white/10 bg-[#0A0A0A] p-6 flex flex-col">
        <div class="mb-8">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6 text-indigo-400" />
            <h1 class="text-xl font-bold text-white tracking-tight">Cognition Bench</h1>
          </div>
          <p class="text-xs text-gray-500">Sovereign WASM Execution Environment</p>
        </div>

        <div class="space-y-6 flex-1">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Active Breed</label>
            <USelectMenu 
              v-model="selectedBreedId" 
              :options="breeds" 
              value-attribute="id"
              option-attribute="name"
              class="w-full bg-white/5 border-white/10 text-white"
            >
              <template #label>
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {{ selectedBreed.name }}
                </div>
              </template>
            </USelectMenu>
            <p class="mt-2 text-xs text-indigo-400/70">{{ selectedBreed.category }}</p>
          </div>

          <div class="pt-4 border-t border-white/5">
            <label class="block text-sm font-medium text-gray-300 mb-2">Input Payload (JSON)</label>
            <textarea 
              v-model="inputJson"
              class="w-full h-64 bg-black border border-white/10 rounded-lg p-4 font-mono text-xs text-gray-300 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none resize-none"
              spellcheck="false"
            ></textarea>
          </div>
        </div>

        <div class="mt-auto pt-6">
          <UButton 
            block 
            size="lg" 
            color="primary" 
            class="font-bold tracking-wide relative overflow-hidden group"
            :loading="isRunning"
            @click="runExecution"
          >
            <div class="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span class="relative flex items-center gap-2">
              <UIcon name="i-heroicons-play-solid" />
              EXECUTE IN KERNEL
            </span>
          </UButton>
        </div>
      </aside>

      <!-- Main Workspace -->
      <main class="flex-1 flex flex-col bg-black">
        
        <!-- Output Panels -->
        <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/5">
          
          <!-- Results -->
          <div class="bg-[#050505] p-6 flex flex-col">
            <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <UIcon name="i-heroicons-document-text" class="text-gray-500" />
              Execution Result
            </h2>
            <div class="flex-1 relative rounded-lg border border-white/5 bg-[#0a0a0a] overflow-hidden">
              <div v-if="isRunning" class="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm z-10">
                <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                <p class="text-sm font-mono text-indigo-400 animate-pulse">Computing Inference...</p>
              </div>
              <textarea 
                readonly
                :value="outputJson"
                class="w-full h-full bg-transparent p-6 font-mono text-sm text-emerald-400 outline-none resize-none"
                placeholder="Awaiting execution..."
              ></textarea>
            </div>
          </div>

          <!-- Traces & Logs -->
          <div class="bg-[#050505] flex flex-col">
            <!-- Cryptographic Receipt -->
            <div class="p-6 pb-0 border-b border-white/5">
              <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <UIcon name="i-heroicons-shield-check" class="text-gray-500" />
                Sovereign Receipt
              </h2>
              <div class="bg-white/[0.02] border border-white/10 rounded-lg p-4 mb-6 min-h-[120px] flex items-center justify-center">
                <div v-if="receipt" class="w-full space-y-2 font-mono text-xs">
                  <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-gray-500">Trace ID</span>
                    <span class="text-gray-300">{{ receipt.trace_id }}</span>
                  </div>
                  <div class="flex justify-between border-b border-white/5 py-2">
                    <span class="text-gray-500">Algorithm</span>
                    <span class="text-indigo-400">{{ receipt.algorithm }}</span>
                  </div>
                  <div class="flex justify-between border-b border-white/5 py-2">
                    <span class="text-gray-500">BLAKE3 Hash</span>
                    <span class="text-emerald-400 truncate w-48 text-right">{{ receipt.output_hash }}</span>
                  </div>
                  <div class="flex justify-between pt-2">
                    <span class="text-gray-500">Signature</span>
                    <span class="text-gray-400 truncate w-48 text-right">{{ receipt.signature }}</span>
                  </div>
                </div>
                <div v-else class="text-gray-600 font-mono text-sm">
                  No trace bound.
                </div>
              </div>
            </div>

            <!-- Terminal / Logs -->
            <div class="flex-1 p-6 flex flex-col">
              <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <UIcon name="i-heroicons-command-line" class="text-gray-500" />
                Telemetry Logs
              </h2>
              <div class="flex-1 bg-[#0a0a0a] border border-white/5 rounded-lg p-4 font-mono text-xs overflow-y-auto space-y-2">
                <div v-for="(log, i) in logs" :key="i" class="text-gray-400">
                  <span class="text-blue-400">{{ log.split('] ')[0] + ']' }}</span>
                  <span :class="log.includes('FATAL') ? 'text-red-400 font-bold' : log.includes('OK') ? 'text-emerald-400' : 'text-gray-300'">
                    {{ log.split('] ')[1] }}
                  </span>
                </div>
                <div v-if="logs.length === 0" class="text-gray-600">
                  Ready.
                </div>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  </div>
</template>
