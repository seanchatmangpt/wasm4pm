/**
 * Shared types for wasm4pm testing harnesses
 */

import { z } from 'zod';

/**
 * Zod schema for OtelSpan.
 *
 * OcelHarvester.harvestWithInstrumentation() ingests spans from real OTEL
 * output (the OTel→OCEL conversion boundary). Incorrect field types silently
 * produce wrong event logs and broken conformance results.
 * Coerces nanosecond fields that OTLP proto encoding may deliver as strings.
 */
export const OtelSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  startTimeUnixNano: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]),
  endTimeUnixNano: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]),
  kind: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: z.object({
    code: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    message: z.string().optional(),
  }),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export type OtelSpan = z.infer<typeof OtelSpanSchema>;

/**
 * Zod schema for OtelResource.
 * Validates resource attribute maps that accompany OTLP span batches.
 */
export const OtelResourceSchema = z.object({
  attributes: z.record(z.string(), z.unknown()),
});

export type OtelResource = z.infer<typeof OtelResourceSchema>;

/**
 * Zod schema for OtelInstrumentationScope.
 */
export const OtelInstrumentationScopeSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
});

export type OtelInstrumentationScope = z.infer<typeof OtelInstrumentationScopeSchema>;
