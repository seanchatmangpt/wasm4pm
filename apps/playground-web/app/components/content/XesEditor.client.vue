<script setup lang="ts">
import { VueMonacoEditor as MonacoEditor } from '@guolao/vue-monaco-editor'
import { useColorMode } from '#imports'

const props = withDefaults(defineProps<{
  modelValue: string
  language?: string
  height?: string
  readOnly?: boolean
}>(), {
  language: 'xml',
  height: '200px',
  readOnly: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const colorMode = useColorMode()

const theme = computed(() => colorMode.value === 'dark' ? 'vs-dark' : 'vs')

const editorOptions = computed(() => ({
  theme: theme.value,
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  readOnly: props.readOnly
}))

function handleChange(value: string | undefined) {
  emit('update:modelValue', value ?? '')
}
</script>

<template>
  <div class="border border-default rounded overflow-hidden" :style="{ height }">
    <MonacoEditor
      :value="modelValue"
      :language="language"
      :options="editorOptions"
      style="width: 100%; height: 100%"
      @change="handleChange"
    />
  </div>
</template>
