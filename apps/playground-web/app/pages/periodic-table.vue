<script setup lang="ts">
import { ref, computed } from 'vue'

useHead({
  title: 'Periodic Table of Reason | Wasm4PM',
  meta: [
    { name: 'description', content: 'Explore the 52 Symbolic Reasoning Breeds of the Periodic Table of Reason in Wasm4PM.' }
  ]
})

interface BreedElement {
  id: string
  name: string
  category: string
  status: 'ADMITTED' | 'PARTIAL_ALIVE'
  symbol: string
  atomicNumber: number
}

// Categories mapped to beautiful Tailwind gradients/colors for the glassmorphism UI
const categoryColors: Record<string, string> = {
  'Temporal / Logic': 'from-blue-500/20 to-indigo-500/20 border-blue-500/50 text-blue-300',
  'Uncertain Reasoning': 'from-purple-500/20 to-pink-500/20 border-purple-500/50 text-purple-300',
  'Constraint Satisfaction': 'from-emerald-500/20 to-teal-500/20 border-emerald-500/50 text-emerald-300',
  'Non-monotonic Logic': 'from-rose-500/20 to-red-500/20 border-rose-500/50 text-rose-300',
  'Planning': 'from-amber-500/20 to-orange-500/20 border-amber-500/50 text-amber-300',
  'Knowledge Representation': 'from-cyan-500/20 to-blue-500/20 border-cyan-500/50 text-cyan-300',
  'Machine Learning': 'from-fuchsia-500/20 to-purple-500/20 border-fuchsia-500/50 text-fuchsia-300',
  'Answer Set Programming': 'from-violet-500/20 to-fuchsia-500/20 border-violet-500/50 text-violet-300',
  'Description Logic': 'from-sky-500/20 to-indigo-500/20 border-sky-500/50 text-sky-300',
  'Decision Theory': 'from-green-500/20 to-emerald-500/20 border-green-500/50 text-green-300',
  'Qualitative Reasoning': 'from-yellow-500/20 to-amber-500/20 border-yellow-500/50 text-yellow-300',
  'Cognitive Architecture': 'from-pink-500/20 to-rose-500/20 border-pink-500/50 text-pink-300',
  'Probabilistic Logic': 'from-indigo-500/20 to-violet-500/20 border-indigo-500/50 text-indigo-300',
  'R_historical': 'from-slate-500/20 to-gray-500/20 border-slate-500/50 text-slate-300',
  'R_autonomic': 'from-zinc-500/20 to-stone-500/20 border-zinc-500/50 text-zinc-300'
}

function getCategoryColor(category: string) {
  for (const key of Object.keys(categoryColors)) {
    if (category.includes(key)) return categoryColors[key]
  }
  return 'from-gray-500/20 to-slate-500/20 border-gray-500/50 text-gray-300'
}

const breeds: BreedElement[] = [
  { atomicNumber: 1, symbol: 'Lt', id: 'ltl_monitor', name: 'LTL Monitor', category: 'Temporal / Logic', status: 'ADMITTED' },
  { atomicNumber: 2, symbol: 'Al', id: 'allen_temporal', name: 'Allen Temporal', category: 'Temporal / Logic', status: 'ADMITTED' },
  { atomicNumber: 3, symbol: 'Fz', id: 'fuzzy_logic', name: 'Fuzzy Logic', category: 'Uncertain Reasoning', status: 'ADMITTED' },
  { atomicNumber: 4, symbol: 'Bn', id: 'bayesian_network', name: 'Bayesian Network', category: 'Uncertain Reasoning', status: 'ADMITTED' },
  { atomicNumber: 5, symbol: 'Cs', id: 'csp_ac3', name: 'CSP AC3', category: 'Constraint Satisfaction', status: 'ADMITTED' },
  { atomicNumber: 6, symbol: 'Dl', id: 'default_logic', name: 'Default Logic', category: 'Non-monotonic Logic', status: 'ADMITTED' },
  { atomicNumber: 7, symbol: 'Ht', id: 'htn_planning', name: 'HTN Planning', category: 'Planning', status: 'ADMITTED' },
  { atomicNumber: 8, symbol: 'Ds', id: 'dempster_shafer', name: 'Dempster Shafer', category: 'Uncertain Reasoning', status: 'ADMITTED' },
  { atomicNumber: 9, symbol: 'Fi', id: 'frames_inheritance', name: 'Frames Inheritance', category: 'Knowledge Representation', status: 'ADMITTED' },
  { atomicNumber: 10, symbol: 'Eb', id: 'ebl', name: 'EBL', category: 'Machine Learning', status: 'ADMITTED' },
  { atomicNumber: 11, symbol: 'As', id: 'asp', name: 'ASP', category: 'Answer Set Programming', status: 'ADMITTED' },
  { atomicNumber: 12, symbol: 'De', id: 'description_logic', name: 'Description Logic', category: 'Description Logic', status: 'ADMITTED' },
  { atomicNumber: 13, symbol: 'Ap', id: 'abductive_lp', name: 'Abductive LP', category: 'Answer Set Programming', status: 'ADMITTED' },
  { atomicNumber: 14, symbol: 'Ai', id: 'abductive_ibe', name: 'Abductive IBE', category: 'Answer Set Programming', status: 'ADMITTED' },
  { atomicNumber: 15, symbol: 'Po', id: 'partial_order_plan', name: 'Partial Order Plan', category: 'Planning', status: 'ADMITTED' },
  { atomicNumber: 16, symbol: 'Ec', id: 'event_calculus', name: 'Event Calculus', category: 'Temporal / Logic', status: 'ADMITTED' },
  { atomicNumber: 17, symbol: 'Md', id: 'mdp', name: 'MDP', category: 'Decision Theory', status: 'ADMITTED' },
  { atomicNumber: 18, symbol: 'Vs', id: 'version_space', name: 'Version Space', category: 'Machine Learning', status: 'ADMITTED' },
  { atomicNumber: 19, symbol: 'Bm', id: 'belief_merging', name: 'Belief Merging', category: 'Knowledge Representation', status: 'ADMITTED' },
  { atomicNumber: 20, symbol: 'Qr', id: 'qualitative_reason', name: 'Qualitative Reason', category: 'Qualitative Reasoning', status: 'ADMITTED' },
  { atomicNumber: 21, symbol: 'Ss', id: 'script_sam', name: 'Script SAM', category: 'Knowledge Representation', status: 'ADMITTED' },
  { atomicNumber: 22, symbol: 'Cl', id: 'clp', name: 'CLP', category: 'Constraint Satisfaction', status: 'ADMITTED' },
  { atomicNumber: 23, symbol: 'Sc', id: 'situation_calculus', name: 'Situation Calculus', category: 'Temporal / Logic', status: 'ADMITTED' },
  { atomicNumber: 24, symbol: 'Ci', id: 'circumscription', name: 'Circumscription', category: 'Non-monotonic Logic', status: 'ADMITTED' },
  { atomicNumber: 25, symbol: 'An', id: 'analogy_sme', name: 'Analogy SME', category: 'Analogical Reasoning', status: 'ADMITTED' },
  { atomicNumber: 26, symbol: 'Ac', id: 'act_r', name: 'ACT-R', category: 'Cognitive Architecture', status: 'ADMITTED' },
  { atomicNumber: 27, symbol: 'Pr', id: 'problog', name: 'Problog', category: 'Probabilistic Logic', status: 'ADMITTED' },
  { atomicNumber: 28, symbol: 'Sa', id: 'sat_cdcl', name: 'SAT CDCL', category: 'Constraint Satisfaction', status: 'ADMITTED' },
  { atomicNumber: 29, symbol: 'Em', id: 'episodic_memory', name: 'Episodic Memory', category: 'Cognitive Architecture', status: 'ADMITTED' },
  { atomicNumber: 30, symbol: 'Rs', id: 'rl_symbolic', name: 'RL Symbolic', category: 'Reinforcement Learning', status: 'ADMITTED' },
  { atomicNumber: 31, symbol: 'Ct', id: 'ctl_check', name: 'CTL Check', category: 'Model Checking', status: 'ADMITTED' },
  { atomicNumber: 32, symbol: 'Il', id: 'ilp', name: 'ILP', category: 'Machine Learning', status: 'ADMITTED' },
  { atomicNumber: 33, symbol: 'Np', id: 'naive_physics', name: 'Naive Physics', category: 'Qualitative Reasoning', status: 'ADMITTED' },
  { atomicNumber: 34, symbol: 'Tb', id: 'tableaux', name: 'Tableaux', category: 'Theorem Proving', status: 'ADMITTED' },
  { atomicNumber: 35, symbol: 'Cg', id: 'construction_grammar', name: 'Construction Grammar', category: 'Cognitive Linguistics', status: 'ADMITTED' },
  { atomicNumber: 36, symbol: 'Ml', id: 'markov_logic', name: 'Markov Logic', category: 'Probabilistic Logic', status: 'ADMITTED' },
  { atomicNumber: 37, symbol: 'Pd', id: 'pomdp', name: 'POMDP', category: 'Decision Theory', status: 'ADMITTED' },
  { atomicNumber: 38, symbol: 'Cp', id: 'contingent_plan', name: 'Contingent Plan', category: 'Planning', status: 'ADMITTED' },
  { atomicNumber: 39, symbol: 'Mr', id: 'meta_reasoning', name: 'Meta Reasoning', category: 'Cognitive Architecture', status: 'ADMITTED' },
  { atomicNumber: 40, symbol: 'Ez', id: 'eliza', name: 'ELIZA', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 41, symbol: 'Cb', id: 'cbr', name: 'CBR', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 42, symbol: 'Dn', id: 'dendral', name: 'DENDRAL', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 43, symbol: 'St', id: 'strips', name: 'STRIPS', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 44, symbol: 'Pl', id: 'prolog', name: 'Prolog', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 45, symbol: 'My', id: 'mycin', name: 'MYCIN', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 46, symbol: 'Gp', id: 'gps', name: 'GPS', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 47, symbol: 'So', id: 'soar', name: 'SOAR', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 48, symbol: 'He', id: 'hearsay', name: 'HEARSAY-II', category: 'R_historical', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 49, symbol: 'Vn', id: 'autoinstinct_neurosis', name: 'Vision / Neurosis', category: 'R_autonomic', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 50, symbol: 'Se', id: 'autoinstinct_semantics', name: 'Semantics', category: 'R_autonomic', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 51, symbol: 'Vi', id: 'autoinstinct_vision', name: 'Vision', category: 'R_autonomic', status: 'PARTIAL_ALIVE' },
  { atomicNumber: 52, symbol: 'Le', id: 'autoinstinct_learning', name: 'Learning', category: 'R_autonomic', status: 'PARTIAL_ALIVE' }
]

const hoveredElement = ref<BreedElement | null>(null)

</script>

<template>
  <div class="min-h-screen bg-[#0A0A0A] text-white p-8 font-sans overflow-x-auto relative z-0">
    <!-- Ambient Background Effects -->
    <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none -z-10"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none -z-10"></div>

    <div class="max-w-7xl mx-auto">
      <header class="mb-12 text-center flex flex-col items-center">
        <div class="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6">
          <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-indigo-400" />
          <span class="text-sm font-medium tracking-wide text-gray-300">v26.6.10 Expansion</span>
        </div>
        <h1 class="text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400 mb-4">
          Periodic Table of Reason
        </h1>
        <p class="text-gray-400 max-w-2xl text-lg font-light leading-relaxed">
          The foundational 52 Symbolic Reasoning Breeds of the Wasm4PM Cognition Kernel.
          Hover over an element to inspect its computational signature.
        </p>
      </header>

      <!-- Dynamic Info Panel -->
      <div class="h-32 mb-8 flex items-center justify-center">
        <transition name="fade" mode="out-in">
          <div v-if="hoveredElement" :key="hoveredElement.id" class="flex items-center gap-8 bg-white/[0.02] border border-white/10 p-6 rounded-2xl backdrop-blur-xl shadow-2xl w-full max-w-3xl">
            <div 
              class="w-24 h-24 rounded-xl flex flex-col items-center justify-center bg-gradient-to-br border-2 shadow-inner"
              :class="getCategoryColor(hoveredElement.category)"
            >
              <span class="text-xs font-mono opacity-60 absolute top-2 left-2">{{ hoveredElement.atomicNumber }}</span>
              <span class="text-3xl font-bold tracking-tight">{{ hoveredElement.symbol }}</span>
            </div>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-2">
                <h2 class="text-2xl font-bold text-white">{{ hoveredElement.name }}</h2>
                <UBadge :color="hoveredElement.status === 'ADMITTED' ? 'emerald' : 'amber'" variant="subtle" size="sm" class="uppercase tracking-widest text-[10px]">
                  {{ hoveredElement.status }}
                </UBadge>
              </div>
              <p class="text-indigo-300 font-medium mb-1">{{ hoveredElement.category }}</p>
              <p class="text-sm font-mono text-gray-500">Registry ID: {{ hoveredElement.id }}</p>
            </div>
          </div>
          <div v-else class="text-gray-600 font-light italic tracking-wide h-full flex items-center">
            Awaiting quantum inspection...
          </div>
        </transition>
      </div>

      <!-- Periodic Table Grid -->
      <div class="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-2">
        <!-- We use an auto-flow layout with some strategic empty spaces to mimic a periodic table -->
        <template v-for="breed in breeds" :key="breed.id">
          <NuxtLink 
            :to="`/workbench?breed=${breed.id}`"
            class="group relative aspect-square rounded-xl border bg-gradient-to-br backdrop-blur-md cursor-pointer transition-all duration-300 hover:scale-110 hover:z-10 hover:shadow-2xl hover:shadow-current block"
            :class="[
              getCategoryColor(breed.category),
              breed.status === 'PARTIAL_ALIVE' ? 'opacity-50 hover:opacity-100 border-dashed' : 'opacity-90 hover:opacity-100',
            ]"
            @mouseenter="hoveredElement = breed"
            @mouseleave="hoveredElement = null"
          >
            <div class="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors rounded-xl"></div>
            <div class="absolute top-1.5 left-2 text-[9px] font-mono opacity-50">{{ breed.atomicNumber }}</div>
            <div class="h-full flex flex-col items-center justify-center">
              <span class="text-xl md:text-2xl font-bold tracking-tight drop-shadow-md">{{ breed.symbol }}</span>
              <span class="text-[8px] md:text-[10px] text-center px-1 font-medium leading-tight opacity-80 mt-1 line-clamp-2 truncate w-full">
                {{ breed.name }}
              </span>
            </div>
          </NuxtLink>
        </template>
      </div>

      <!-- Legend -->
      <div class="mt-16 flex flex-wrap justify-center gap-6">
        <div v-for="(color, category) in categoryColors" :key="category" class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-gradient-to-br" :class="color"></div>
          <span class="text-xs font-medium text-gray-400">{{ category }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
