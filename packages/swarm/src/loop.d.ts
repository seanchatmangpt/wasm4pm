/**
 * loop.ts — Vercel AI SDK Swarm Loop
 *
 * Two-tier generateText architecture:
 *   - TypeScript orchestrator (not LLM): fans out N parallel worker generateText calls
 *   - Each worker: generateText({ maxSteps: 20, tools: wasm4pm__+onto__ })
 *   - After each round: Reflection LLM synthesizes convergence
 *
 * Usage:
 *   import { runSwarm } from '@wasm4pm/swarm'
 *   const artifact = await runSwarm(config)
 */
import type { SwarmConfig, WorkerSpec, SwarmEpisode, SwarmArtifact } from './types.js';
export type { SwarmConfig, SwarmArtifact, SwarmEpisode, WorkerSpec };
/**
 * Main swarm entry point.
 *
 * In a full implementation this imports @ai-sdk/groq and calls generateText().
 * The implementation here provides the structural skeleton; the actual LLM calls
 * require GROQ_API_KEY to be set and the ai/@ai-sdk/groq packages installed.
 */
export declare function runSwarm(config: SwarmConfig): Promise<SwarmArtifact>;
//# sourceMappingURL=loop.d.ts.map