<script setup lang="ts">
import { useReceipt } from '~/composables/useReceipt'

const props = withDefaults(defineProps<{
  breed?: string
  label?: string
}>(), {
  breed: 'mycin',
  label: ''
})

// Bundled minimal intent.json for each breed
const PRESETS: Record<string, unknown> = {
  mycin: {
    breed: 'mycin',
    contract: {
      intent: 'diagnosis',
      candidates: [],
      facts: [
        { key: 'organism', value: 'gram_positive_cocci' },
        { key: 'organism', value: 'strep' },
        { key: 'site', value: 'throat' }
      ],
      cases: [],
      rules: [
        { id: 'r1', premise: ['organism=gram_positive_cocci', 'organism=strep'], conclusion: 'diagnosis=strep_infection', certainty: 0.7 },
        { id: 'r2', premise: ['diagnosis=strep_infection'], conclusion: 'antibiotic=penicillin', certainty: 0.95 }
      ],
      goals: [{ id: 'g1', predicate: 'antibiotic', value: 'penicillin' }],
      state: []
    }
  },
  eliza: {
    breed: 'eliza',
    contract: {
      intent: 'I feel sad about my deadlines',
      candidates: [], facts: [], cases: [],
      rules: [{ id: 'feel-pattern', premise: ['pattern:I feel (\\w+)'], conclusion: 'Why do you feel $1?', certainty: 1.0 }],
      goals: [], state: []
    }
  },
  cbr: {
    breed: 'cbr',
    contract: {
      intent: 'best-recipe',
      candidates: [],
      facts: [{ key: 'ingredient', value: 'flour' }, { key: 'ingredient', value: 'egg' }],
      cases: [{ id: 'pancakes', intent: 'best-recipe', architecture: 'pancakes', outcome_score: 0.9, facts: [{ key: 'ingredient', value: 'flour' }, { key: 'ingredient', value: 'egg' }] }],
      rules: [], goals: [], state: []
    }
  }
}

// Hit the CLI cognition endpoint via Nuxt server route (falls back to inline result display)
const contractInput = ref(JSON.stringify(PRESETS[props.breed] ?? PRESETS.mycin, null, 2))
const result = ref<unknown>(null)
const running = ref(false)
const error = ref<string | null>(null)
const { saveReceipt } = useReceipt()
const receipt = ref<import('../../../app/composables/useReceipt').Receipt | null>(null)

async function run() {
  running.value = true
  error.value = null
  result.value = null
  try {
    const body = JSON.parse(contractInput.value)
    // POST to Nuxt server API route /api/cognition
    const res = await $fetch<{ output: unknown; output_hash: string; run_id: string }>(
      '/api/cognition',
      { method: 'POST', body }
    )
    result.value = res.output
    receipt.value = await saveReceipt(contractInput.value, res, props.breed)
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <div class="cognition-demo border border-default rounded-lg overflow-hidden my-6">
    <div class="flex items-center justify-between px-4 py-2 bg-elevated border-b border-default">
      <div class="flex items-center gap-2">
        <UBadge variant="soft" color="secondary" size="sm">{{ breed }}</UBadge>
        <span v-if="label" class="text-sm text-muted">{{ label }}</span>
      </div>
      <UButton size="sm" :loading="running" icon="i-lucide-brain" @click="run">
        Run
      </UButton>
    </div>
    <div class="p-4 border-b border-default">
      <p class="text-xs text-muted mb-2 uppercase tracking-wider">Contract (intent.json)</p>
      <UTextarea v-model="contractInput" :rows="8" class="font-mono text-xs" />
    </div>
    <div v-if="result || error" class="p-4">
      <UAlert v-if="error" color="error" :description="error" class="mb-3" />
      <template v-else>
        <pre class="text-xs bg-default rounded p-3 overflow-auto max-h-64">{{ JSON.stringify(result, null, 2) }}</pre>
        <ReceiptViewer v-if="receipt" :receipt="receipt" class="mt-3" />
      </template>
    </div>
  </div>
</template>
