/**
 * BPMN Test Utilities
 *
 * Utilities for testing BPMN serialization/deserialization.
 * Provides helpers for validating BPMN structure and content.
 */
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
  messageFlows?: Array<{
    id: string;
    sourceRef: string;
    targetRef: string;
  }>;
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
/**
 * Parse BPMN XML string into structured format.
 */
export declare function parseBPMN(bpmnXml: string): BPMNDefinition;
/**
 * Serialize structured BPMN to XML string.
 */
export declare function serializeBPMN(definition: BPMNDefinition): string;
/**
 * Validate BPMN structure and compliance.
 */
export declare function validateBPMN(bpmnXml: string): BPMNValidationResult;
/**
 * Validate that BPMN has required structure for process mining.
 */
export declare function validateBPMNForProcessMining(bpmnXml: string): BPMNValidationResult;
/**
 * Create a minimal valid BPMN for testing.
 */
export declare function createMinimalBPMN(): string;
/**
 * Create a BPMN with parallel gateway for testing.
 */
export declare function createParallelGatewayBPMN(): string;
/**
 * Create a BPMN with exclusive gateway for testing.
 */
export declare function createExclusiveGatewayBPMN(): string;
/**
 * Create an invalid BPMN for testing validation.
 */
export declare function createInvalidBPMN(): string;
/**
 * Round-trip test: parse and serialize BPMN.
 *
 * Returns true if the round-trip produces equivalent XML.
 */
export declare function roundTripBPMN(bpmnXml: string): {
  success: boolean;
  result?: string;
  error?: string;
};
/**
 * Format BPMN validation result as human-readable string.
 */
export declare function formatBPMNValidationResult(result: BPMNValidationResult): string;
/**
 * Count elements in BPMN by type.
 */
export declare function countBPMNElementsByType(bpmnXml: string): Map<string, number>;
/**
 * Extract activity names from BPMN.
 */
export declare function extractActivityNames(bpmnXml: string): string[];
//# sourceMappingURL=bpmn.d.ts.map
