/**
 * Synthetic Log Generator — Ground Truth for Audit Validation
 *
 * Generates XES logs with known properties:
 * - 5000 cases × 100 events = 500K events (small scale for quick testing)
 * - Or 50000 cases × 100 events = 5M events (large scale load test)
 * - Perfect sequential process: A → B → C → D (fitness must = 1.0)
 * - No noise, no rework, deterministic timestamps
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SyntheticLogConfig {
  numCases: number;           // Case count (5000 typical, 50000 for stress)
  eventsPerCase: number;      // Events per case (100 typical)
  activities: string[];       // Activity sequence (e.g., ['A', 'B', 'C', 'D'])
  startTime: Date;            // Log start time
  timeBetweenEvents: number;  // Ms between events in a case
  timeBetweenCases: number;   // Ms between case start times
}

export const DEFAULT_CONFIG: SyntheticLogConfig = {
  numCases: 5000,
  eventsPerCase: 100,
  activities: ['Register', 'Examine', 'Decide', 'Close'],
  startTime: new Date('2026-01-01T00:00:00Z'),
  timeBetweenEvents: 100,    // 100ms between events
  timeBetweenCases: 1000,    // 1s between case starts
};

export interface LogStatistics {
  totalEvents: number;
  totalCases: number;
  activityCount: Map<string, number>;
  expectedFitness: number;   // For sequential process, always 1.0
}

/**
 * Generate synthetic XES log with known ground truth.
 * Returns the XES XML as a string (for smaller logs).
 */
export function generateSyntheticLog(config: SyntheticLogConfig): string {
  // For logs > 1M events, use streaming instead (see writeSyntheticLogStreaming)
  if (config.numCases > 10000) {
    throw new Error('Use writeSyntheticLogStreaming for large logs (>10K cases). This function cannot handle such large string allocations.');
  }

  const logs: string[] = [];
  logs.push('<?xml version="1.0" encoding="UTF-8"?>');
  logs.push('<log xes.version="1.0" xes.features="arctype" openlog.version="1.0">');
  logs.push('  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>');
  logs.push('  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>');
  logs.push('  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>');
  logs.push('  <extension name="Semantic" prefix="semantic" uri="http://www.xes-standard.org/semantic.xesext"/>');
  logs.push('  <global scope="trace">');
  logs.push('    <string key="concept:name" value="unknown"/>');
  logs.push('  </global>');
  logs.push('  <global scope="event">');
  logs.push('    <string key="concept:name" value="unknown"/>');
  logs.push('    <string key="org:resource" value="unknown"/>');
  logs.push('  </global>');

  const activityCount = new Map<string, number>();

  // Generate cases
  let currentTime = config.startTime.getTime();
  for (let caseIdx = 0; caseIdx < config.numCases; caseIdx++) {
    logs.push(`  <trace>`);
    logs.push(`    <string key="concept:name" value="case_${caseIdx}"/>`);

    // Generate events within case (perfect sequential order)
    let caseTime = currentTime;
    for (let eventIdx = 0; eventIdx < config.eventsPerCase; eventIdx++) {
      const activityIdx = eventIdx % config.activities.length;
      const activity = config.activities[activityIdx];

      activityCount.set(activity, (activityCount.get(activity) ?? 0) + 1);

      const isoTime = new Date(caseTime).toISOString();
      logs.push(`    <event>`);
      logs.push(`      <string key="concept:name" value="${activity}"/>`);
      logs.push(`      <string key="org:resource" value="resource_${eventIdx % 5}"/>`);
      logs.push(`      <date key="time:timestamp" value="${isoTime}"/>`);
      logs.push(`    </event>`);

      caseTime += config.timeBetweenEvents;
    }

    logs.push(`  </trace>`);

    currentTime += config.timeBetweenCases;
  }

  logs.push('</log>');

  return logs.join('\n');
}

/**
 * Write synthetic log to file (streaming for large logs).
 */
export function writeSyntheticLog(
  filePath: string,
  config: SyntheticLogConfig = DEFAULT_CONFIG
): LogStatistics {
  // Use streaming for large logs
  if (config.numCases > 10000) {
    return writeSyntheticLogStreaming(filePath, config);
  }

  const xes = generateSyntheticLog(config);
  fs.writeFileSync(filePath, xes, 'utf-8');

  const activityCount = new Map<string, number>();
  const totalEvents = config.numCases * config.eventsPerCase;

  // Count activities: each activity appears (eventsPerCase / activities.length) times per case
  for (const activity of config.activities) {
    const countPerCase = Math.floor(config.eventsPerCase / config.activities.length);
    const totalCount = config.numCases * countPerCase;
    if (totalCount > 0) {
      activityCount.set(activity, totalCount);
    }
  }

  return {
    totalEvents,
    totalCases: config.numCases,
    activityCount,
    expectedFitness: 1.0, // Perfect sequential process
  };
}

/**
 * Write synthetic log using write-append (avoids string allocation limits).
 * Used for large logs (>10K cases).
 */
function writeSyntheticLogStreaming(
  filePath: string,
  config: SyntheticLogConfig
): LogStatistics {
  const chunks: string[] = [];
  const CHUNK_SIZE = 1000; // Write every 1000 events

  chunks.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  chunks.push('<log xes.version="1.0" xes.features="arctype" openlog.version="1.0">\n');
  chunks.push('  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>\n');
  chunks.push('  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>\n');
  chunks.push('  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>\n');
  chunks.push('  <extension name="Semantic" prefix="semantic" uri="http://www.xes-standard.org/semantic.xesext"/>\n');
  chunks.push('  <global scope="trace">\n');
  chunks.push('    <string key="concept:name" value="unknown"/>\n');
  chunks.push('  </global>\n');
  chunks.push('  <global scope="event">\n');
  chunks.push('    <string key="concept:name" value="unknown"/>\n');
  chunks.push('    <string key="org:resource" value="unknown"/>\n');
  chunks.push('  </global>\n');

  fs.writeFileSync(filePath, chunks.join(''), { encoding: 'utf-8' });

  let currentTime = config.startTime.getTime();
  let eventCount = 0;

  for (let caseIdx = 0; caseIdx < config.numCases; caseIdx++) {
    const traceChunks: string[] = [];
    traceChunks.push(`  <trace>\n`);
    traceChunks.push(`    <string key="concept:name" value="case_${caseIdx}"/>\n`);

    let caseTime = currentTime;
    for (let eventIdx = 0; eventIdx < config.eventsPerCase; eventIdx++) {
      const activityIdx = eventIdx % config.activities.length;
      const activity = config.activities[activityIdx];
      const isoTime = new Date(caseTime).toISOString();

      traceChunks.push(`    <event>\n`);
      traceChunks.push(`      <string key="concept:name" value="${activity}"/>\n`);
      traceChunks.push(`      <string key="org:resource" value="resource_${eventIdx % 5}"/>\n`);
      traceChunks.push(`      <date key="time:timestamp" value="${isoTime}"/>\n`);
      traceChunks.push(`    </event>\n`);

      caseTime += config.timeBetweenEvents;
      eventCount++;

      if (eventCount % CHUNK_SIZE === 0) {
        fs.appendFileSync(filePath, traceChunks.join(''), { encoding: 'utf-8' });
        traceChunks.length = 0;
      }
    }

    traceChunks.push(`  </trace>\n`);
    fs.appendFileSync(filePath, traceChunks.join(''), { encoding: 'utf-8' });
    currentTime += config.timeBetweenCases;
  }

  fs.appendFileSync(filePath, '</log>', { encoding: 'utf-8' });

  const activityCount = new Map<string, number>();
  const totalEvents = config.numCases * config.eventsPerCase;

  for (const activity of config.activities) {
    const countPerCase = Math.floor(config.eventsPerCase / config.activities.length);
    const totalCount = config.numCases * countPerCase;
    if (totalCount > 0) {
      activityCount.set(activity, totalCount);
    }
  }

  return {
    totalEvents,
    totalCases: config.numCases,
    activityCount,
    expectedFitness: 1.0,
  };
}

/**
 * Generate logs for different scales (quick/normal/stress tests).
 */
export function generateScaleSeries(outputDir: string): Map<string, LogStatistics> {
  const results = new Map<string, LogStatistics>();

  // Quick test: 500 cases × 100 events = 50K events
  const quickStats = writeSyntheticLog(
    path.join(outputDir, 'synthetic-quick-50k.xes'),
    { ...DEFAULT_CONFIG, numCases: 500 }
  );
  results.set('quick', quickStats);

  // Normal test: 5000 cases × 100 events = 500K events
  const normalStats = writeSyntheticLog(
    path.join(outputDir, 'synthetic-normal-500k.xes'),
    DEFAULT_CONFIG
  );
  results.set('normal', normalStats);

  // Stress test: 50000 cases × 100 events = 5M events
  const stressStats = writeSyntheticLog(
    path.join(outputDir, 'synthetic-stress-5m.xes'),
    { ...DEFAULT_CONFIG, numCases: 50000 }
  );
  results.set('stress', stressStats);

  return results;
}
