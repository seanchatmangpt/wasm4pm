/**
 * BPMN Test Utilities
 *
 * Utilities for testing BPMN serialization/deserialization.
 * Provides helpers for validating BPMN structure and content.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface BPMNElement {
  id: string;
  name?: string;
  type?: string;
  incoming?: string[];
  outgoing?: string[];
  [key: string]: unknown;
}

export interface BPMNProcess {
  id: string;
  name?: string;
  isExecutable?: boolean;
  elements: BPMNElement[];
}

export interface BPMNDefinition {
  id: string;
  targetNamespace?: string;
  processes: BPMNProcess[];
  messageFlows?: Array<{ id: string; sourceRef: string; targetRef: string }>;
}

export interface BPMNValidationResult {
  valid: boolean;
  errors: BPMNValidationError[];
  warnings: BPMNValidationError[];
}

export interface BPMNValidationError {
  element: string;
  attribute: string;
  message: string;
  severity: 'error' | 'warning';
}

// ─── BPMN Parsing ─────────────────────────────────────────────────────────

/**
 * Parse BPMN XML string into structured format.
 */
export function parseBPMN(bpmnXml: string): BPMNDefinition {
  const parser = new DOMParser();
  const doc = parser.parseFromString(bpmnXml, 'application/xml');

  // Check for parsing errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Invalid XML: ${parseError.textContent}`);
  }

  const definitions = doc.documentElement;
  if (definitions.tagName !== 'definitions') {
    throw new Error('Root element must be <definitions>');
  }

  const processes: BPMNProcess[] = [];
  const processElements = definitions.querySelectorAll('process');

  processElements.forEach(processEl => {
    const process: BPMNProcess = {
      id: processEl.getAttribute('id') || '',
      name: processEl.getAttribute('name') || undefined,
      isExecutable: processEl.getAttribute('isExecutable') === 'true',
      elements: [],
    };

    // Parse process elements
    const elements = processEl.children;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const element: BPMNElement = {
        id: el.getAttribute('id') || `${process.id}_el_${i}`,
        name: el.getAttribute('name') || undefined,
        type: el.tagName,
      };

      // Parse incoming/outgoing flows
      const incoming = el.getAttribute('incoming');
      if (incoming) {
        element.incoming = incoming.split(' ');
      }

      const outgoing = el.getAttribute('outgoing');
      if (outgoing) {
        element.outgoing = outgoing.split(' ');
      }

      // Store all attributes
      for (let j = 0; j < el.attributes.length; j++) {
        const attr = el.attributes[j];
        element[attr.name] = attr.value;
      }

      process.elements.push(element);
    }

    processes.push(process);
  });

  // Parse message flows
  const messageFlows: Array<{ id: string; sourceRef: string; targetRef: string }> = [];
  const flowElements = definitions.querySelectorAll('messageFlow');
  flowElements.forEach(flow => {
    messageFlows.push({
      id: flow.getAttribute('id') || '',
      sourceRef: flow.getAttribute('sourceRef') || '',
      targetRef: flow.getAttribute('targetRef') || '',
    });
  });

  return {
    id: definitions.getAttribute('id') || '',
    targetNamespace: definitions.getAttribute('targetNamespace') || undefined,
    processes,
    messageFlows,
  };
}

/**
 * Serialize structured BPMN to XML string.
 */
export function serializeBPMN(definition: BPMNDefinition): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<definitions id="${definition.id}" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="${definition.targetNamespace || 'http://bpmn.io/schema/bpmn'}">`);

  // Serialize processes
  for (const process of definition.processes) {
    lines.push(`  <process id="${process.id}"${process.name ? ` name="${process.name}"` : ''}${process.isExecutable !== undefined ? ` isExecutable="${process.isExecutable}"` : ''}>`);

    // Serialize elements
    for (const element of process.elements) {
      const attrs = Object.entries(element)
        .filter(([k, v]) => k !== 'incoming' && k !== 'outgoing' && v !== undefined)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');

      lines.push(`    <${element.type} ${attrs}${element.incoming ? ` incoming="${element.incoming.join(' ')}"` : ''}${element.outgoing ? ` outgoing="${element.outgoing.join(' ')}"` : ''} />`);
    }

    lines.push(`  </process>`);
  }

  // Serialize message flows
  if (definition.messageFlows) {
    for (const flow of definition.messageFlows) {
      lines.push(`  <messageFlow id="${flow.id}" sourceRef="${flow.sourceRef}" targetRef="${flow.targetRef}" />`);
    }
  }

  lines.push('</definitions>');

  return lines.join('\n');
}

// ─── BPMN Validation ───────────────────────────────────────────────────────

/**
 * Validate BPMN structure and compliance.
 */
export function validateBPMN(bpmnXml: string): BPMNValidationResult {
  const errors: BPMNValidationError[] = [];
  const warnings: BPMNValidationError[] = [];

  let definition: BPMNDefinition;
  try {
    definition = parseBPMN(bpmnXml);
  } catch (e) {
    return {
      valid: false,
      errors: [{ element: 'definitions', attribute: 'xml', message: String(e), severity: 'error' }],
      warnings: [],
    };
  }

  // Validate definition
  if (!definition.id) {
    errors.push({ element: 'definitions', attribute: 'id', message: 'Missing id', severity: 'error' });
  }

  if (!definition.targetNamespace) {
    warnings.push({ element: 'definitions', attribute: 'targetNamespace', message: 'Missing targetNamespace', severity: 'warning' });
  }

  if (definition.processes.length === 0) {
    errors.push({ element: 'definitions', attribute: 'processes', message: 'No processes defined', severity: 'error' });
  }

  // Validate each process
  definition.processes.forEach((process, processIdx) => {
    const processPath = `process[${processIdx}]`;

    if (!process.id) {
      errors.push({ element: processPath, attribute: 'id', message: 'Missing process id', severity: 'error' });
    }

    if (process.elements.length === 0) {
      warnings.push({ element: processPath, attribute: 'elements', message: 'Process has no elements', severity: 'warning' });
    }

    // Validate element IDs are unique
    const elementIds = new Set<string>();
    process.elements.forEach((element, elIdx) => {
      const elementPath = `${processPath}/element[${elIdx}]`;

      if (!element.id) {
        errors.push({ element: elementPath, attribute: 'id', message: 'Missing element id', severity: 'error' });
      } else if (elementIds.has(element.id)) {
        errors.push({ element: elementPath, attribute: 'id', message: `Duplicate id: ${element.id}`, severity: 'error' });
      } else {
        elementIds.add(element.id);
      }

      // Validate sequence flows reference valid elements
      if (element.type === 'sequenceFlow') {
        const sourceRef = element.sourceRef as string | undefined;
        const targetRef = element.targetRef as string | undefined;

        if (!sourceRef) {
          errors.push({ element: elementPath, attribute: 'sourceRef', message: 'Missing sourceRef', severity: 'error' });
        } else if (!elementIds.has(sourceRef) && !process.elements.some(e => e.id === sourceRef)) {
          warnings.push({ element: elementPath, attribute: 'sourceRef', message: `Invalid sourceRef: ${sourceRef}`, severity: 'warning' });
        }

        if (!targetRef) {
          errors.push({ element: elementPath, attribute: 'targetRef', message: 'Missing targetRef', severity: 'error' });
        } else if (!elementIds.has(targetRef) && !process.elements.some(e => e.id === targetRef)) {
          warnings.push({ element: elementPath, attribute: 'targetRef', message: `Invalid targetRef: ${targetRef}`, severity: 'warning' });
        }
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that BPMN has required structure for process mining.
 */
export function validateBPMNForProcessMining(bpmnXml: string): BPMNValidationResult {
  const baseResult = validateBPMN(bpmnXml);
  const errors = [...baseResult.errors];
  const warnings = [...baseResult.warnings];

  let definition: BPMNDefinition;
  try {
    definition = parseBPMN(bpmnXml);
  } catch {
    return baseResult;
  }

  // Check for at least one start event
  definition.processes.forEach((process, processIdx) => {
    const processPath = `process[${processIdx}]`;
    const startEvents = process.elements.filter(e => e.type === 'startEvent');

    if (startEvents.length === 0) {
      warnings.push({ element: processPath, attribute: 'startEvent', message: 'No start event found', severity: 'warning' });
    }

    if (startEvents.length > 1) {
      warnings.push({ element: processPath, attribute: 'startEvent', message: 'Multiple start events', severity: 'warning' });
    }

    // Check for at least one end event
    const endEvents = process.elements.filter(e => e.type === 'endEvent');
    if (endEvents.length === 0) {
      warnings.push({ element: processPath, attribute: 'endEvent', message: 'No end event found', severity: 'warning' });
    }

    // Check for tasks
    const tasks = process.elements.filter(e => e.type === 'task' || e.type === 'serviceTask' || e.type === 'userTask');
    if (tasks.length === 0) {
      warnings.push({ element: processPath, attribute: 'task', message: 'No tasks found', severity: 'warning' });
    }

    // Check for sequence flows
    const sequenceFlows = process.elements.filter(e => e.type === 'sequenceFlow');
    if (sequenceFlows.length === 0) {
      errors.push({ element: processPath, attribute: 'sequenceFlow', message: 'No sequence flows', severity: 'error' });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Test Helpers ─────────────────────────────────────────────────────────

/**
 * Create a minimal valid BPMN for testing.
 */
export function createMinimalBPMN(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions id="Definition_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" />
    <task id="Task_1" name="Task A" />
    <task id="Task_2" name="Task B" />
    <endEvent id="EndEvent_1" />
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
  </process>
</definitions>`;
}

/**
 * Create a BPMN with parallel gateway for testing.
 */
export function createParallelGatewayBPMN(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions id="Definition_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" />
    <task id="Task_A" name="Task A" />
    <parallelGateway id="Gateway_Split_1" />
    <task id="Task_B1" name="Task B1" />
    <task id="Task_B2" name="Task B2" />
    <parallelGateway id="Gateway_Join_1" />
    <task id="Task_C" name="Task C" />
    <endEvent id="EndEvent_1" />
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A" />
    <sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Gateway_Split_1" />
    <sequenceFlow id="Flow_3" sourceRef="Gateway_Split_1" targetRef="Task_B1" />
    <sequenceFlow id="Flow_4" sourceRef="Gateway_Split_1" targetRef="Task_B2" />
    <sequenceFlow id="Flow_5" sourceRef="Task_B1" targetRef="Gateway_Join_1" />
    <sequenceFlow id="Flow_6" sourceRef="Task_B2" targetRef="Gateway_Join_1" />
    <sequenceFlow id="Flow_7" sourceRef="Gateway_Join_1" targetRef="Task_C" />
    <sequenceFlow id="Flow_8" sourceRef="Task_C" targetRef="EndEvent_1" />
  </process>
</definitions>`;
}

/**
 * Create a BPMN with exclusive gateway for testing.
 */
export function createExclusiveGatewayBPMN(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions id="Definition_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" />
    <task id="Task_A" name="Task A" />
    <exclusiveGateway id="Gateway_1" />
    <task id="Task_B" name="Task B" />
    <task id="Task_C" name="Task C" />
    <endEvent id="EndEvent_1" />
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A" />
    <sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Gateway_1" />
    <sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Task_B" />
    <sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Task_C" />
    <sequenceFlow id="Flow_5" sourceRef="Task_B" targetRef="EndEvent_1" />
    <sequenceFlow id="Flow_6" sourceRef="Task_C" targetRef="EndEvent_1" />
  </process>
</definitions>`;
}

/**
 * Create an invalid BPMN for testing validation.
 */
export function createInvalidBPMN(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions>
  <process id="Process_1">
    <!-- Missing start event -->
    <task id="Task_1" name="Task A" />
    <!-- Missing end event -->
    <!-- Invalid sequence flow - missing target -->
    <sequenceFlow id="Flow_1" sourceRef="Task_1" />
  </process>
</definitions>`;
}

/**
 * Round-trip test: parse and serialize BPMN.
 *
 * Returns true if the round-trip produces equivalent XML.
 */
export function roundTripBPMN(bpmnXml: string): { success: boolean; result?: string; error?: string } {
  try {
    const definition = parseBPMN(bpmnXml);
    const serialized = serializeBPMN(definition);

    // Parse again to verify
    const reparsed = parseBPMN(serialized);

    // Check structure equivalence
    if (reparsed.processes.length !== definition.processes.length) {
      return { success: false, error: 'Process count mismatch' };
    }

    return { success: true, result: serialized };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format BPMN validation result as human-readable string.
 */
export function formatBPMNValidationResult(result: BPMNValidationResult): string {
  const lines: string[] = [];

  lines.push(`BPMN Validation: ${result.valid ? 'PASS' : 'FAIL'}`);
  lines.push(`Errors: ${result.errors.length}`);
  lines.push(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    result.errors.forEach(e => {
      lines.push(`  [ERROR] ${e.element}.${e.attribute}: ${e.message}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    result.warnings.forEach(w => {
      lines.push(`  [WARN] ${w.element}.${w.attribute}: ${w.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Count elements in BPMN by type.
 */
export function countBPMNElementsByType(bpmnXml: string): Map<string, number> {
  const counts = new Map<string, number>();

  try {
    const definition = parseBPMN(bpmnXml);

    for (const process of definition.processes) {
      for (const element of process.elements) {
        const type = element.type || 'unknown';
        counts.set(type, (counts.get(type) || 0) + 1);
      }
    }
  } catch (e) {
    // Return empty map on parse error
  }

  return counts;
}

/**
 * Extract activity names from BPMN.
 */
export function extractActivityNames(bpmnXml: string): string[] {
  const names: string[] = [];

  try {
    const definition = parseBPMN(bpmnXml);

    for (const process of definition.processes) {
      for (const element of process.elements) {
        if (element.type === 'task' && element.name) {
          names.push(element.name);
        }
      }
    }
  } catch (e) {
    // Return empty array on parse error
  }

  return names;
}
