export default defineNuxtPlugin(async () => {
  if (import.meta.server) return
  const { init } = useWasm()
  const t0 = performance.now()
  try {
    await init()
    const duration_ms = Math.round(performance.now() - t0)
    console.info('[wasm-otel] init ok', duration_ms + 'ms')
    await $fetch('/api/otel-event', {
      method: 'POST',
      body: { service_name: 'playground-web', event: 'wasm.init', status: 'ok', duration_ms },
    }).catch(() => {})
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const duration_ms = Math.round(performance.now() - t0)
    console.error('[wasm-otel] init FAILED:', msg)
    await $fetch('/api/otel-event', {
      method: 'POST',
      body: { service_name: 'playground-web', event: 'wasm.init', status: 'error', error: msg, duration_ms },
    }).catch(() => {})
  }
})
