import { tool } from 'ai'
import { z } from 'zod'
import * as wasm from 'wasm4pm'

/**
 * wasm4pm__ tools for Vercel AI SDK swarm workers
 */

export const wasm4pm__discover_dfg = tool({
  description: 'Discover a Directly-Follows Graph (DFG) process model from XES content.',
  parameters: z.object({
    xes_content: z.string().describe('XES event log content'),
    min_frequency: z.number().optional().describe('Minimum edge frequency (0-1)'),
  }),
  // @ts-ignore
  execute: async (args: { xes_content: string, min_frequency?: number }): Promise<string> => {
    const logHandle = wasm.load_eventlog_from_xes(args.xes_content)
    const result = args.min_frequency 
      ? wasm.discover_dfg_filtered(logHandle, 'concept:name', args.min_frequency)
      : wasm.discover_dfg(logHandle, 'concept:name')
    return typeof result === 'string' ? result : JSON.stringify(result)
  },
})

export const wasm4pm__analyze_statistics = tool({
  description: 'Analyze event log statistics: trace count, event count, duration, etc.',
  parameters: z.object({
    xes_content: z.string().describe('XES event log content'),
  }),
  // @ts-ignore
  execute: async (args: { xes_content: string }): Promise<string> => {
    const logHandle = wasm.load_eventlog_from_xes(args.xes_content)
    const result = wasm.analyze_event_statistics(logHandle)
    return typeof result === 'string' ? result : JSON.stringify(result)
  },
})

export const wasm4pm__detect_concept_drift = tool({
  description: 'Detect concept drift in a process log over time.',
  parameters: z.object({
    xes_content: z.string().describe('XES event log content'),
    window_size: z.number().optional().describe('Window size for drift detection'),
  }),
  // @ts-ignore
  execute: async (args: { xes_content: string, window_size?: number }): Promise<string> => {
    const logHandle = wasm.load_eventlog_from_xes(args.xes_content)
    const result = wasm.detect_drift(logHandle, 'concept:name', args.window_size ?? 50)
    return typeof result === 'string' ? result : JSON.stringify(result)
  },
})

export const swarmTools = {
  wasm4pm__discover_dfg,
  wasm4pm__analyze_statistics,
  wasm4pm__detect_concept_drift,
}
