export default defineNuxtPlugin(async () => {
  if (import.meta.server) return
  const { init } = useWasm()
  const t0 = performance.now()
  try {
    await init()
    console.info('[wasm-otel] init ok', String(Math.round(performance.now() - t0)) + 'ms')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[wasm-otel] init FAILED:', msg)
    await $fetch('/api/otel-event', {
      method: 'POST',
      body: { event: 'wasm.init.failed', error: msg, duration_ms: Math.round(performance.now() - t0) }
    }).catch(() => {})
  }
})
