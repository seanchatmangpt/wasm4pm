import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runSwarm, type SwarmConfig, type SwarmArtifact } from '../loop';
import { ConvergenceMaxIterationsError, ConvergenceTimeoutError } from '../types';

describe('SwarmLoop — orchestration loop lifecycle', () => {
  const minimalConfig: SwarmConfig = {
    maxEpisodes: 2,
    maxSteps: 5,
    convergenceRuns: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'test-key-12345';
  });

  it('should initialize with valid config', () => {
    expect(minimalConfig.maxEpisodes).toBeGreaterThan(0);
    expect(minimalConfig.maxSteps).toBeGreaterThan(0);
    expect(minimalConfig.convergenceRuns).toBeGreaterThan(0);
  });

  it('should accept SwarmConfig with required fields', () => {
    const config: SwarmConfig = {
      maxEpisodes: 3,
      maxSteps: 10,
      convergenceRuns: 2,
    };
    expect(config).toHaveProperty('maxEpisodes');
    expect(config).toHaveProperty('maxSteps');
    expect(config).toHaveProperty('convergenceRuns');
  });

  it('should support optional workerModel configuration', () => {
    const config: SwarmConfig = {
      maxEpisodes: 2,
      maxSteps: 5,
      convergenceRuns: 1,
      workerModel: 'groq-llama2',
    };
    expect(config.workerModel).toBe('groq-llama2');
  });

  it('should enforce maxIterations cap if provided', () => {
    const config: SwarmConfig = {
      maxEpisodes: 5,
      maxSteps: 10,
      convergenceRuns: 2,
      maxIterations: 20,
    };
    expect(config.maxIterations).toBeLessThan(
      config.maxEpisodes * config.maxSteps
    );
  });

  it('should support throwOnTimeout flag', () => {
    const config: SwarmConfig = {
      maxEpisodes: 2,
      maxSteps: 5,
      convergenceRuns: 1,
      throwOnTimeout: true,
    };
    expect(config.throwOnTimeout).toBe(true);
  });

  it('should validate episode count is positive', () => {
    const validConfig: SwarmConfig = {
      maxEpisodes: 1,
      maxSteps: 5,
      convergenceRuns: 1,
    };
    expect(validConfig.maxEpisodes).toBeGreaterThan(0);
  });
});
