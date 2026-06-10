<script setup lang="ts">
const props = withDefaults(defineProps<{
  fitness: number
  precision: number
  simplicity: number
  generalization: number
  label?: string
}>(), {
  label: ''
})

type BadgeColor = 'success' | 'warning' | 'error'

function colorFor(value: number): BadgeColor {
  if (value > 0.85) return 'success'
  if (value >= 0.6) return 'warning'
  return 'error'
}

function fmt(value: number): string {
  return value.toFixed(2)
}

const dimensions = computed(() => [
  {
    name: 'fitness',
    value: props.fitness,
    color: colorFor(props.fitness),
    tooltip: 'Fraction of the log the model can replay. Must be > 0.85 for wasm4pm conformance gate.'
  },
  {
    name: 'precision',
    value: props.precision,
    color: colorFor(props.precision),
    tooltip: 'How much unseen behavior the model allows. Higher = tighter fit.'
  },
  {
    name: 'simplicity',
    value: props.simplicity,
    color: colorFor(props.simplicity),
    tooltip: 'Model complexity (Occam\'s razor). Fewer nodes/edges = higher score.'
  },
  {
    name: 'generalization',
    value: props.generalization,
    color: colorFor(props.generalization),
    tooltip: 'How well the model generalizes beyond the training log.'
  }
])
</script>

<template>
  <div class="quality-badge-group">
    <p v-if="label" class="quality-badge-label">{{ label }}</p>
    <div class="quality-badge-row">
      <UTooltip
        v-for="dim in dimensions"
        :key="dim.name"
        :text="dim.tooltip"
      >
        <UBadge
          :color="dim.color"
          variant="subtle"
          class="quality-badge"
        >
          {{ dim.name }}: {{ fmt(dim.value) }}
        </UBadge>
      </UTooltip>
    </div>
  </div>
</template>

<style scoped>
.quality-badge-group {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
}

.quality-badge-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-500, #6b7280);
  margin: 0 0 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.quality-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.quality-badge {
  cursor: default;
  font-variant-numeric: tabular-nums;
}
</style>
