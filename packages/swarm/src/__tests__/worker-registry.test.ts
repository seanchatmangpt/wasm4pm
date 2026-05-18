import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  spawnWorker,
  getSwarmId,
  incrementEpisodeCount,
  getEpisodeCount,
  resetSwarm,
  getWorker,
  storeResult,
  setWorkerStatus,
} from '../worker-registry';
import type { WorkerResult, WorkerStatus } from '../types';

describe('WorkerRegistry — worker lifecycle management', () => {
  beforeEach(() => {
    // Start with clean state
    resetSwarm();
  });

  afterEach(() => {
    resetSwarm();
  });

  it('should spawn a worker with valid state', () => {
    const xesContent = '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';
    const worker = spawnWorker('worker-1', xesContent, 'test-label');

    expect(worker).toHaveProperty('workerId', 'worker-1');
    expect(worker).toHaveProperty('label', 'test-label');
    expect(worker).toHaveProperty('xesContent');
    expect(worker).toHaveProperty('logHash');
    expect(worker).toHaveProperty('status', 'ready');
  });

  it('should track swarm ID uniquely', () => {
    const swarmId1 = getSwarmId();
    expect(typeof swarmId1).toBe('string');
    expect(swarmId1.length).toBeGreaterThan(0);

    // After reset, new swarm ID
    resetSwarm();
    const swarmId2 = getSwarmId();
    expect(swarmId2).not.toBe(swarmId1);
  });

  it('should increment episode count', () => {
    expect(getEpisodeCount()).toBe(0);

    incrementEpisodeCount();
    expect(getEpisodeCount()).toBe(1);

    incrementEpisodeCount();
    expect(getEpisodeCount()).toBe(2);
  });

  it('should store and retrieve worker results', () => {
    const xesContent = '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';
    const worker = spawnWorker('worker-1', xesContent);

    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'abc123hash',
      result: { edges: [['A', 'B']] },
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    storeResult(result.workerId, result);

    const retrieved = getWorker('worker-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.results.has('dfg')).toBe(true);
    expect(retrieved?.results.get('dfg')).toEqual(result);
  });

  it('should update worker status', () => {
    const xesContent = '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';
    spawnWorker('worker-1', xesContent);

    setWorkerStatus('worker-1', 'running');
    let worker = getWorker('worker-1');
    expect(worker?.status).toBe('running');

    setWorkerStatus('worker-1', 'done');
    worker = getWorker('worker-1');
    expect(worker?.status).toBe('done');
  });

  it('should handle worker errors gracefully', () => {
    const xesContent = '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';
    spawnWorker('worker-1', xesContent);

    const errorResult: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: '',
      result: {},
      runAt: new Date().toISOString(),
      durationMs: 10,
      error: 'Algorithm timeout',
      failed: true,
    };

    storeResult(errorResult.workerId, errorResult);

    const worker = getWorker('worker-1');
    const failedResult = worker?.results.get('dfg');
    expect(failedResult?.failed).toBe(true);
    expect(failedResult?.error).toBe('Algorithm timeout');
  });

  it('should clear registry on reset', () => {
    const xesContent = '<log><trace><event><string key="concept:name" value="A"/></event></trace></log>';
    spawnWorker('worker-1', xesContent);
    spawnWorker('worker-2', xesContent);

    expect(getWorker('worker-1')).toBeDefined();
    expect(getWorker('worker-2')).toBeDefined();

    resetSwarm();

    expect(getWorker('worker-1')).toBeUndefined();
    expect(getWorker('worker-2')).toBeUndefined();
  });
});
