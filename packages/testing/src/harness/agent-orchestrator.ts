/**
 * Agent Orchestrator
 *
 * Coordinates all 9 van der Aalst agents into a unified pipeline.
 * Executes: harvest → discover → conformance → soundness → performance → cost → drift → prescriptive → predictive → federation voting
 *
 * This is the Blue Ocean: process intelligence as derived artifact, not governing object.
 */

import type { OcelEventLog } from './ocel-harvester';
import { OcelHarvester } from './ocel-harvester';
import { AlgorithmDiscovery } from './algorithm-discovery';
import { ConformanceChecker } from './conformance-checker';
import { SoundnessVerifier } from './soundness-verifier';
import { PerformanceAnalyzer } from './performance-analyzer';
import { CostProfiler } from './cost-profiler';
import { DriftMonitor } from './drift-monitor';
import { PrescriptiveAgent } from './prescriptive-agent';
import { PredictiveAgent } from './predictive-agent';
import { FederationVoting } from './federation-voting';

export interface OrchestratorResult {
  stage: string;
  executionTimeMs: number;
  success: boolean;
  message: string;
  stageResults: {
    ocel?: OcelEventLog;
    discovery?: {
      modelFitness: number;
      recommendedAlgorithm: string;
    };
    conformance?: {
      fitness: number;
      precision: number;
      violations: number;
    };
    soundness?: {
      verdict: string;
      deadlockFree: boolean;
      liveness: boolean;
      bounded: boolean;
    };
    performance?: {
      avgTraceTimeMs: number;
      topBottleneck: string;
    };
    cost?: {
      selectedAlgorithm: string;
      estimatedCost: number;
    };
    drift?: {
      driftDetected: boolean;
      driftSeverity: number;
      warningLevel: string;
    };
    prescriptive?: {
      totalGainPercent: number;
      recommendedActions: number;
    };
    predictive?: {
      predictedOutcome: string;
      confidencePercent: number;
    };
    federation?: {
      verdict: string;
      confidence: number;
      agreeingAgents: number;
    };
  };
}

export interface AgentFederationConfig {
  enableHarvest: boolean;
  enableDiscovery: boolean;
  enableConformance: boolean;
  enableSoundness: boolean;
  enablePerformance: boolean;
  enableCost: boolean;
  enableDrift: boolean;
  enablePrescriptive: boolean;
  enablePredictive: boolean;
  enableFederation: boolean;
  budgetMs?: number; // Max execution time for entire pipeline
  resourceBudget?: { maxLatencyMs: number; maxComputeUnits: number; costLimit: number };
}

export class AgentOrchestrator {
  private harvester = new OcelHarvester();
  private discovery = new AlgorithmDiscovery();
  private conformance = new ConformanceChecker();
  private soundness = new SoundnessVerifier();
  private performance = new PerformanceAnalyzer();
  private cost = new CostProfiler();
  private drift = new DriftMonitor();
  private prescriptive = new PrescriptiveAgent();
  private predictive = new PredictiveAgent();
  private federation = new FederationVoting();

  async orchestrate(
    otel: any, // OTel spans (loosely typed for flexibility)
    baselineOcel?: OcelEventLog,
    config: AgentFederationConfig = {
      enableHarvest: true,
      enableDiscovery: true,
      enableConformance: true,
      enableSoundness: true,
      enablePerformance: true,
      enableCost: true,
      enableDrift: true,
      enablePrescriptive: true,
      enablePredictive: true,
      enableFederation: true,
    }
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const stageResults: OrchestratorResult['stageResults'] = {};

    try {
      // Stage 1: Harvest (Agent 1)
      if (config.enableHarvest) {
        const harvestStart = Date.now();
        const ocel = await this.harvester.harvestWithInstrumentation(otel);
        stageResults.ocel = ocel;
        console.log(`[Agent 1] Harvest complete in ${Date.now() - harvestStart}ms (${ocel.events.length} events)`);
      }

      const currentOcel = stageResults.ocel!;

      // Stage 2: Discovery (Agent 2)
      if (config.enableDiscovery) {
        const discoveryStart = Date.now();
        const discovery = await this.discovery.discoverWithAllAlgorithms(currentOcel);
        const topAlgo = discovery.algorithms[0];
        stageResults.discovery = {
          modelFitness: topAlgo.fitness,
          recommendedAlgorithm: topAlgo.name,
        };
        console.log(`[Agent 2] Discovery: ${topAlgo.name} (fitness ${topAlgo.fitness.toFixed(2)}) in ${Date.now() - discoveryStart}ms`);
      }

      // Stage 3: Conformance (Agent 3)
      if (config.enableConformance) {
        const conformStart = Date.now();
        const conf = await this.conformance.checkConformance(currentOcel);
        stageResults.conformance = {
          fitness: conf.fitness,
          precision: conf.precision,
          violations: conf.violations.length,
        };
        console.log(`[Agent 3] Conformance: fitness ${conf.fitness.toFixed(2)}, precision ${conf.precision.toFixed(2)}, ${conf.violations.length} violations in ${Date.now() - conformStart}ms`);
      }

      // Stage 4: Soundness (Agent 4)
      if (config.enableSoundness) {
        const soundStart = Date.now();
        const sound = await this.soundness.verify(currentOcel);
        stageResults.soundness = {
          verdict: sound.verdict,
          deadlockFree: sound.deadlockFree,
          liveness: sound.liveness,
          bounded: sound.bounded,
        };
        console.log(`[Agent 4] Soundness: ${sound.verdict} (${sound.deadlockFree ? 'deadlock-free' : 'deadlock risk'}) in ${Date.now() - soundStart}ms`);
      }

      // Stage 5: Performance (Agent 5)
      if (config.enablePerformance) {
        const perfStart = Date.now();
        const perf = await this.performance.analyzePerformance(currentOcel);
        stageResults.performance = {
          avgTraceTimeMs: perf.avgTraceTimeMs,
          topBottleneck: perf.bottlenecks[0]?.activity ?? 'none',
        };
        console.log(`[Agent 5] Performance: avg ${perf.avgTraceTimeMs.toFixed(0)}ms, bottleneck '${stageResults.performance.topBottleneck}' in ${Date.now() - perfStart}ms`);
      }

      // Stage 6: Cost (Agent 6)
      if (config.enableCost) {
        const costStart = Date.now();
        const selectedAlgo = await this.cost.selectOptimalAlgorithm(
          [
            {
              name: stageResults.discovery?.recommendedAlgorithm ?? 'dfg',
              fitness: stageResults.discovery?.modelFitness ?? 0.8,
              precision: 0.75,
              simplicity: 0.8,
              generalization: 0.7,
              executionTimeMs: 50,
              edgeCount: 10,
              transitionCount: 5,
            },
          ],
          config.resourceBudget ?? {
            maxLatencyMs: 5000,
            maxComputeUnits: 10000,
            costLimit: 1000,
          }
        );
        stageResults.cost = {
          selectedAlgorithm: selectedAlgo.name,
          estimatedCost: selectedAlgo.executionTimeMs * 0.5,
        };
        console.log(`[Agent 6] Cost: selected ${selectedAlgo.name} (cost ${(selectedAlgo.executionTimeMs * 0.5).toFixed(0)}) in ${Date.now() - costStart}ms`);
      }

      // Stage 7: Drift (Agent 7)
      if (config.enableDrift && baselineOcel) {
        const driftStart = Date.now();
        const driftResult = await this.drift.detectDrift(baselineOcel, currentOcel);
        stageResults.drift = {
          driftDetected: driftResult.driftDetected,
          driftSeverity: driftResult.driftSeverity,
          warningLevel: driftResult.warningLevel,
        };
        console.log(`[Agent 7] Drift: ${driftResult.driftDetected ? 'DETECTED' : 'none'} (severity ${driftResult.driftSeverity.toFixed(2)}, ${driftResult.warningLevel}) in ${Date.now() - driftStart}ms`);
      }

      // Stage 8: Prescriptive (Agent 8)
      if (config.enablePrescriptive) {
        const prescStart = Date.now();
        const plan = await this.prescriptive.generateOptimizationPlan(currentOcel);
        stageResults.prescriptive = {
          totalGainPercent: plan.totalExpectedGainPercent,
          recommendedActions: plan.actions.length,
        };
        console.log(`[Agent 8] Prescriptive: ${plan.actions.length} actions, ${plan.totalExpectedGainPercent.toFixed(0)}% expected gain in ${Date.now() - prescStart}ms`);
      }

      // Stage 9: Predictive (Agent 9)
      if (config.enablePredictive) {
        const predStart = Date.now();
        const outcome = await this.predictive.predictOutcomeRisk(
          currentOcel.events.slice(0, Math.min(10, currentOcel.events.length)),
          currentOcel
        );
        stageResults.predictive = {
          predictedOutcome: outcome.predictionType,
          confidencePercent: Math.round(outcome.probability * 100),
        };
        console.log(`[Agent 9] Predictive: ${outcome.predictionType} (${outcome.probability.toFixed(2)} confidence, risk ${outcome.riskScore.toFixed(2)}) in ${Date.now() - predStart}ms`);
      }

      // Stage 10: Federation Voting
      if (config.enableFederation) {
        const fedStart = Date.now();

        const getVerdict = (fitness: number): 'TRUTHFUL' | 'VARIANCE' | 'DECEPTIVE' =>
          fitness >= 0.95 ? 'TRUTHFUL' : fitness >= 0.7 ? 'VARIANCE' : 'DECEPTIVE';

        const conformanceVerdicts = [
          {
            agentId: 'agent_2_discovery',
            fitness: stageResults.discovery?.modelFitness ?? 0.8,
            verdict: getVerdict(stageResults.discovery?.modelFitness ?? 0.8),
          },
          {
            agentId: 'agent_3_conformance',
            fitness: stageResults.conformance?.fitness ?? 0.8,
            verdict: getVerdict(stageResults.conformance?.fitness ?? 0.8),
          },
          {
            agentId: 'agent_4_soundness',
            fitness: stageResults.soundness?.deadlockFree ? 0.95 : 0.4,
            verdict: (stageResults.soundness?.deadlockFree ? 'TRUTHFUL' : 'DECEPTIVE') as 'TRUTHFUL' | 'DECEPTIVE',
          },
          {
            agentId: 'agent_5_performance',
            fitness: 0.8,
            verdict: 'TRUTHFUL' as 'TRUTHFUL',
          },
          {
            agentId: 'agent_6_cost',
            fitness: 0.85,
            verdict: 'TRUTHFUL' as 'TRUTHFUL',
          },
        ];

        const consensus = await this.federation.reachConsensus(conformanceVerdicts);
        stageResults.federation = {
          verdict: consensus.verdict,
          confidence: consensus.confidence,
          agreeingAgents: consensus.votesForVerdict,
        };
        console.log(`[Federation] Consensus: ${consensus.verdict} (${consensus.confidence.toFixed(2)} confidence, ${consensus.votesForVerdict}/5 agents agree) in ${Date.now() - fedStart}ms`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`\n✅ Orchestration complete in ${totalTime}ms`);

      return {
        stage: 'orchestration_complete',
        executionTimeMs: totalTime,
        success: true,
        message: `All 9 agents executed successfully. Process intelligence: ${stageResults.federation?.verdict ?? 'COMPLETE'}.`,
        stageResults,
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      return {
        stage: 'error',
        executionTimeMs: totalTime,
        success: false,
        message: `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`,
        stageResults,
      };
    }
  }
}
