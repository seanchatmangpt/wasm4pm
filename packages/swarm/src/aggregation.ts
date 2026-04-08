/**
 * aggregation.ts
 *
 * Merges algorithm results across workers.
 * Strategies: union, intersection, majority_vote, weighted_avg.
 */

import { hashOutput } from './convergence.js'
import type { WorkerResult } from './types.js'

export type AggregationStrategy = 'union' | 'intersection' | 'majority_vote' | 'weighted_avg' | 'ml_ensemble'

export interface AggregateResult {
  algorithm: string
  strategy: AggregationStrategy
  workersIncluded: number
  aggregate: unknown
  aggregateHash: string
  consensusRatio: number
}

export function aggregate(
  results: WorkerResult[],
  algorithm: string,
  strategy: AggregationStrategy = 'union',
  workerIds?: string[]
): AggregateResult {
  const relevant = results.filter(
    r => r.algorithmId === algorithm && (!workerIds || workerIds.includes(r.workerId))
  )

  if (relevant.length === 0) {
    return {
      algorithm,
      strategy,
      workersIncluded: 0,
      aggregate: null,
      aggregateHash: hashOutput(null),
      consensusRatio: 0,
    }
  }

  // Count hash frequencies for consensus ratio
  const hashCounts = new Map<string, number>()
  for (const r of relevant) {
    hashCounts.set(r.resultHash, (hashCounts.get(r.resultHash) ?? 0) + 1)
  }
  const maxCount = Math.max(...hashCounts.values())
  const consensusRatio = maxCount / relevant.length

  let aggregate: unknown

  switch (strategy) {
    case 'majority_vote': {
      // Return the result held by the majority
      let dominant = relevant[0]
      for (const [h, count] of hashCounts) {
        if (count === maxCount) {
          dominant = relevant.find(r => r.resultHash === h) ?? dominant
          break
        }
      }
      aggregate = dominant.result
      break
    }

    case 'intersection': {
      // Keep only edges/nodes present in ALL workers' DFG results
      aggregate = intersectDfgResults(relevant.map(r => r.result))
      break
    }

    case 'weighted_avg': {
      // Average numeric fields across DFG results
      aggregate = averageDfgResults(relevant.map(r => r.result))
      break
    }

    case 'ml_ensemble': {
      // Dispatch by algorithm type to appropriate ML aggregation
      aggregate = ensembleMlResults(algorithm, relevant.map(r => r.result))
      break
    }

    case 'union':
    default: {
      // Union of all edges/nodes across all workers
      aggregate = unionDfgResults(relevant.map(r => r.result))
      break
    }
  }

  return {
    algorithm,
    strategy,
    workersIncluded: relevant.length,
    aggregate,
    aggregateHash: hashOutput(aggregate),
    consensusRatio,
  }
}

// ── DFG merge helpers ───────────────────────────────────────────────────────

type DfgLike = { nodes?: unknown[]; edges?: unknown[] } | null

function asDfg(result: unknown): DfgLike {
  if (!result || typeof result !== 'object') return null
  return result as DfgLike
}

function unionDfgResults(results: unknown[]): unknown {
  const nodeSet = new Set<string>()
  const edgeSet = new Set<string>()
  const allNodes: unknown[] = []
  const allEdges: unknown[] = []

  for (const r of results) {
    const dfg = asDfg(r)
    if (!dfg) continue
    for (const n of dfg.nodes ?? []) {
      const key = JSON.stringify(n)
      if (!nodeSet.has(key)) { nodeSet.add(key); allNodes.push(n) }
    }
    for (const e of dfg.edges ?? []) {
      const key = JSON.stringify(e)
      if (!edgeSet.has(key)) { edgeSet.add(key); allEdges.push(e) }
    }
  }

  return { nodes: allNodes, edges: allEdges }
}

function intersectDfgResults(results: unknown[]): unknown {
  if (results.length === 0) return { nodes: [], edges: [] }

  const first = asDfg(results[0])
  if (!first) return { nodes: [], edges: [] }

  const nodeKeys = new Set((first.nodes ?? []).map(n => JSON.stringify(n)))
  const edgeKeys = new Set((first.edges ?? []).map(e => JSON.stringify(e)))

  for (const r of results.slice(1)) {
    const dfg = asDfg(r)
    if (!dfg) return { nodes: [], edges: [] }
    const rNodeKeys = new Set((dfg.nodes ?? []).map(n => JSON.stringify(n)))
    const rEdgeKeys = new Set((dfg.edges ?? []).map(e => JSON.stringify(e)))
    for (const k of nodeKeys) { if (!rNodeKeys.has(k)) nodeKeys.delete(k) }
    for (const k of edgeKeys) { if (!rEdgeKeys.has(k)) edgeKeys.delete(k) }
  }

  const nodes = (first.nodes ?? []).filter(n => nodeKeys.has(JSON.stringify(n)))
  const edges = (first.edges ?? []).filter(e => edgeKeys.has(JSON.stringify(e)))
  return { nodes, edges }
}

function averageDfgResults(results: unknown[]): unknown {
  // Average edge weights across workers for matching source→target pairs
  const edgeWeights = new Map<string, number[]>()
  const edgesByKey = new Map<string, unknown>()
  const nodeSet = new Set<string>()
  const nodesByKey = new Map<string, unknown>()

  for (const r of results) {
    const dfg = asDfg(r)
    if (!dfg) continue
    for (const n of dfg.nodes ?? []) {
      const key = JSON.stringify((n as Record<string, unknown>)?.id ?? n)
      nodeSet.add(key)
      nodesByKey.set(key, n)
    }
    for (const e of dfg.edges ?? []) {
      const edge = e as Record<string, unknown>
      const key = `${edge.source}→${edge.target}`
      const weight = typeof edge.weight === 'number' ? edge.weight : 1
      const arr = edgeWeights.get(key) ?? []
      arr.push(weight)
      edgeWeights.set(key, arr)
      edgesByKey.set(key, e)
    }
  }

  const edges = Array.from(edgeWeights.entries()).map(([key, weights]) => {
    const base = edgesByKey.get(key) as Record<string, unknown>
    return { ...base, weight: weights.reduce((a, b) => a + b, 0) / weights.length }
  })

  return { nodes: Array.from(nodesByKey.values()), edges }
}

// ── ML ensemble aggregation helpers ────────────────────────────────────────────

/**
 * Dispatch ML aggregation by algorithm type:
 *   - ml_classify → majority vote on predicted labels
 *   - ml_cluster  → consensus on cluster assignments
 *   - ml_forecast → average of forecast values
 *   - ml_anomaly  → union of detected anomalies
 *   - ml_regress  → average of regression coefficients
 *   - ml_pca      → average of explained variance
 *   - fallback    → majority vote on hash
 */
function ensembleMlResults(algorithm: string, results: unknown[]): unknown {
  if (results.length === 0) return null

  if (algorithm === 'ml_classify' || algorithm === 'ml_cluster') {
    return majorityVoteMl(results)
  }
  if (algorithm === 'ml_forecast' || algorithm === 'ml_regress') {
    return averageNumericMl(results)
  }
  if (algorithm === 'ml_anomaly') {
    return unionAnomalies(results)
  }
  if (algorithm === 'ml_pca') {
    return averageNumericMl(results)
  }

  // Fallback: return the first result (most common)
  return results[0]
}

/**
 * Majority vote on ML classification/cluster predictions.
 * For each caseId, the most common predicted label wins.
 */
function majorityVoteMl(results: unknown[]): unknown {
  const allPredictions: Array<{ caseId: string; predicted: string; confidence: number }> = []

  for (const r of results) {
    const res = r as Record<string, unknown>
    const preds = (res.predictions ?? res.assignments ?? []) as Array<Record<string, unknown>>
    for (const p of preds) {
      const caseId = String(p.caseId ?? '')
      const predicted = String(p.predicted ?? p.cluster ?? '')
      const confidence = typeof p.confidence === 'number' ? p.confidence : 1
      if (caseId) allPredictions.push({ caseId, predicted, confidence })
    }
  }

  // Group by caseId, take majority vote
  const byCase = new Map<string, Map<string, number>>()
  for (const p of allPredictions) {
    const votes = byCase.get(p.caseId) ?? new Map<string, number>()
    votes.set(p.predicted, (votes.get(p.predicted) ?? 0) + 1)
    byCase.set(p.caseId, votes)
  }

  const finalPredictions = Array.from(byCase.entries()).map(([caseId, votes]) => {
    let maxVotes = 0
    let dominant = ''
    for (const [label, count] of votes) {
      if (count > maxVotes) {
        maxVotes = count
        dominant = label
      }
    }
    return { caseId, predicted: dominant, confidence: maxVotes / allPredictions.filter(p => p.caseId === caseId).length }
  })

  const method = (results[0] as Record<string, unknown>)?.method ?? 'ensemble'
  return {
    predictions: finalPredictions,
    method,
    ensembleSize: results.length,
  }
}

/**
 * Average numeric ML results (forecast, regression, PCA).
 * For forecast arrays: element-wise average across workers.
 * For regression/PCA objects: average each numeric field.
 */
function averageNumericMl(results: unknown[]): unknown {
  // Try forecast array averaging
  const forecasts = results
    .map(r => (r as Record<string, unknown>)?.forecast)
    .filter((f): f is number[] => Array.isArray(f))

  if (forecasts.length > 0) {
    const maxLen = Math.max(...forecasts.map(f => f.length))
    const avg: number[] = Array.from({ length: maxLen }, (_, i) => {
      const vals = forecasts.filter(f => i < f.length).map(f => f[i])
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    })
    return {
      forecast: avg,
      method: 'ensemble_average',
      ensembleSize: results.length,
      seriesLength: (results[0] as Record<string, unknown>)?.seriesLength,
    }
  }

  // Try numeric field averaging (regression, PCA)
  const numericFields = new Map<string, number[]>()
  for (const r of results) {
    const obj = r as Record<string, unknown>
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        const arr = numericFields.get(key) ?? []
        arr.push(value)
        numericFields.set(key, arr)
      }
    }
  }

  const averaged: Record<string, unknown> = {
    method: 'ensemble_average',
    ensembleSize: results.length,
  }
  for (const [key, values] of numericFields) {
    averaged[key] = values.reduce((a, b) => a + b, 0) / values.length
  }

  // Preserve non-numeric fields from first result
  const first = results[0] as Record<string, unknown>
  for (const [key, value] of Object.entries(first)) {
    if (typeof value !== 'number' && !(key in averaged)) {
      averaged[key] = value
    }
  }

  return averaged
}

/**
 * Union of detected anomalies across workers.
 * Merges peak indices, deduplicating by index.
 */
function unionAnomalies(results: unknown[]): unknown {
  const allPeaks = new Set<number>()
  const peakValues = new Map<number, number>()

  for (const r of results) {
    const obj = r as Record<string, unknown>
    const peaks = (obj.peakIndices ?? []) as number[]
    const values = (obj.peakValues ?? []) as number[]
    for (let i = 0; i < peaks.length; i++) {
      if (!allPeaks.has(peaks[i])) {
        allPeaks.add(peaks[i])
        peakValues.set(peaks[i], values[i] ?? 0)
      }
    }
  }

  const sortedPeaks = Array.from(allPeaks).sort((a, b) => a - b)
  return {
    peakIndices: sortedPeaks,
    peakValues: sortedPeaks.map(i => peakValues.get(i) ?? 0),
    ensembleSize: results.length,
    method: 'ensemble_union',
  }
}
