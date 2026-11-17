import type {
  CognitionRunInput,
  CognitionResult,
  BreedContract,
  BreedOutput
} from './types.d.ts';

export * from './types.d.ts';

export function runBreed(input: CognitionRunInput): CognitionResult;
export function getCapabilities(): {
  breeds: Array<{ id: string; name: string; year: number; lineage?: string }>;
};
export function replay(runId: string): any;
export function verifySession(state: any): any;
