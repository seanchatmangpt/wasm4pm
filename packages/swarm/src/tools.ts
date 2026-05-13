import { tool } from 'ai';
import { z } from 'zod';
import * as wasm from 'wasm4pm';
import { WasmBackend } from '@wasm4pm/kernel';

/**
 * wasm4pm__ tools for Vercel AI SDK swarm workers.
 * These tools leverage the core backends for execution.
 */

// We instantiate backends locally for the tools
const wasmBackend = new WasmBackend();

export const wasm4pm__discover_dfg = tool({
  description: 'Discover a Directly-Follows Graph (DFG) process model from XES content using WASM.',
  parameters: z.object({
    xes_content: z.string().describe('XES event log content'),
  }),
  // @ts-ignore
  execute: async (args: { xes_content: string }): Promise<string> => {
    // In a real swarm, the orchestrator might have already parsed the log
    const logHandle = wasm.load_eventlog_from_xes(args.xes_content);
    const result = wasm.discover_dfg(logHandle, 'concept:name');
    return typeof result === 'string' ? result : JSON.stringify(result);
  },
});

export const wasm4pm__analyze_statistics = tool({
  description: 'Analyze event log statistics using WASM.',
  parameters: z.object({
    xes_content: z.string().describe('XES event log content'),
  }),
  // @ts-ignore
  execute: async (args: { xes_content: string }): Promise<string> => {
    const logHandle = wasm.load_eventlog_from_xes(args.xes_content);
    const result = wasm.analyze_event_statistics(logHandle);
    return typeof result === 'string' ? result : JSON.stringify(result);
  },
});

export const wasm4pm__detect_concept_drift = tool({
  description: 'Detect concept drift in a process log using WASM.',
  parameters: z.object({
    xes_content: z.string().describe('XES event log content'),
  }),
  // @ts-ignore
  execute: async (args: { xes_content: string }): Promise<string> => {
    const logHandle = wasm.load_eventlog_from_xes(args.xes_content);
    const result = wasm.detect_drift(logHandle, 'concept:name', 50);
    return typeof result === 'string' ? result : JSON.stringify(result);
  },
});

export const swarmTools = {
  wasm4pm__discover_dfg,
  wasm4pm__analyze_statistics,
  wasm4pm__detect_concept_drift,
};
