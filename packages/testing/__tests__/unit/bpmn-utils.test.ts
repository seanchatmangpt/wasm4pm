/**
 * Unit tests for BPMN utilities
 *
 * Note: BPMN parsing requires DOMParser (browser-only).
 * In Node.js, only serialization and validation tests can run.
 */

import { describe, it, expect } from 'vitest';
import {
  createMinimalBPMN,
  createParallelGatewayBPMN,
  createExclusiveGatewayBPMN,
  createInvalidBPMN,
  roundTripBPMN,
  countBPMNElementsByType,
  extractActivityNames,
  formatBPMNValidationResult,
  type BPMNValidationResult,
} from '@pictl/testing';

const describeIf = typeof DOMParser !== 'undefined' ? describe : describe.skip;

// ─── Test Helpers (no DOMParser needed) ───────────────────────────────────────

describe('createMinimalBPMN', () => {
  it('should return valid BPMN XML string', () => {
    const xml = createMinimalBPMN();
    expect(xml).toContain('<definitions');
    expect(xml).toContain('id="Definition_1"');
    expect(xml).toContain('id="Process_1"');
    expect(xml).toContain('startEvent');
    expect(xml).toContain('endEvent');
    expect(xml).toContain('sequenceFlow');
  });
});

describe('createParallelGatewayBPMN', () => {
  it('should include parallel gateways', () => {
    const xml = createParallelGatewayBPMN();
    expect(xml).toContain('parallelGateway');
    expect(xml).toContain('Gateway_Split_1');
    expect(xml).toContain('Gateway_Join_1');
    expect(xml).toContain('Task_B1');
    expect(xml).toContain('Task_B2');
  });
});

describe('createExclusiveGatewayBPMN', () => {
  it('should include exclusive gateway', () => {
    const xml = createExclusiveGatewayBPMN();
    expect(xml).toContain('exclusiveGateway');
    expect(xml).toContain('Gateway_1');
    expect(xml).toContain('Task_B');
    expect(xml).toContain('Task_C');
  });
});

describe('createInvalidBPMN', () => {
  it('should return BPMN with structural issues', () => {
    const xml = createInvalidBPMN();
    expect(xml).toContain('<definitions>');
    expect(xml).toContain('Process_1');
    // Missing start/end events
    expect(xml).not.toContain('startEvent');
    expect(xml).not.toContain('endEvent');
  });
});

// ─── DOMParser-dependent tests ────────────────────────────────────────────────

describeIf('parseBPMN + validateBPMN', () => {
  it('should validate minimal BPMN as valid', async () => {
    const { validateBPMN } = await import('@pictl/testing');
    const result = validateBPMN(createMinimalBPMN());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid BPMN', async () => {
    const { validateBPMN } = await import('@pictl/testing');
    const result = validateBPMN(createInvalidBPMN());
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate process mining requirements', async () => {
    const { validateBPMNForProcessMining } = await import('@pictl/testing');
    const result = validateBPMNForProcessMining(createMinimalBPMN());
    expect(result.valid).toBe(true);
  });

  it('should warn about missing tasks', async () => {
    const { validateBPMNForProcessMining } = await import('@pictl/testing');
    const minimalNoTasks = `<?xml version="1.0" encoding="UTF-8"?>
<definitions id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="P1" isExecutable="false">
    <startEvent id="S1" />
    <endEvent id="E1" />
    <sequenceFlow id="F1" sourceRef="S1" targetRef="E1" />
  </process>
</definitions>`;
    const result = validateBPMNForProcessMining(minimalNoTasks);
    expect(result.warnings.some(w => w.message.includes('No tasks'))).toBe(true);
  });

  it('should detect invalid XML', async () => {
    const { validateBPMN } = await import('@pictl/testing');
    const result = validateBPMN('not xml at all');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Invalid XML');
  });

  it('should round-trip BPMN XML', async () => {
    const { roundTripBPMN } = await import('@pictl/testing');
    const xml = createMinimalBPMN();
    const result = roundTripBPMN(xml);
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });
});

// ─── DOMParser-dependent function tests ───────────────────────────────────────

describeIf('countBPMNElementsByType', () => {
  it('should count elements by type', async () => {
    const { countBPMNElementsByType } = await import('@pictl/testing');
    const counts = countBPMNElementsByType(createMinimalBPMN());
    expect(counts.get('startEvent')).toBe(1);
    expect(counts.get('endEvent')).toBe(1);
    expect(counts.get('task')).toBe(2);
    expect(counts.get('sequenceFlow')).toBe(3);
  });
});

describeIf('extractActivityNames', () => {
  it('should extract task names', async () => {
    const { extractActivityNames } = await import('@pictl/testing');
    const names = extractActivityNames(createMinimalBPMN());
    expect(names).toContain('Task A');
    expect(names).toContain('Task B');
  });
});

// ─── Formatting tests (no DOMParser needed) ───────────────────────────────────

describe('formatBPMNValidationResult', () => {
  it('should format valid result', () => {
    const result: BPMNValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };
    const formatted = formatBPMNValidationResult(result);
    expect(formatted).toContain('PASS');
  });

  it('should format invalid result with errors', () => {
    const result: BPMNValidationResult = {
      valid: false,
      errors: [{ element: 'process[0]', attribute: 'startEvent', message: 'No start event', severity: 'error' }],
      warnings: [{ element: 'process[0]', attribute: 'task', message: 'No tasks', severity: 'warning' }],
    };
    const formatted = formatBPMNValidationResult(result);
    expect(formatted).toContain('FAIL');
    expect(formatted).toContain('ERROR');
    expect(formatted).toContain('WARN');
  });
});
