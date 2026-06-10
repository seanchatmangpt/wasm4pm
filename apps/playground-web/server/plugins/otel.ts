import { OtelExporter } from '@wasm4pm/observability'

export default defineNitroPlugin(() => {
  if (!process.env.WASM4PM_OTEL_ENABLED) return

  const endpoint = process.env.WASM4PM_OTEL_ENDPOINT ?? 'http://localhost:4318'

  new OtelExporter({
    enabled: true,
    exporter: 'otlp_http',
    endpoint,
    required: false,
  })

  console.info('[otel] initialized endpoint:', endpoint)
})
