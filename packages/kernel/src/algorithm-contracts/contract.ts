import type { AlgorithmMetadata } from '../registry.js';

export interface AlgorithmContract {
  readonly id: string;
  readonly pattern: string;
}

const FORBIDDEN_PLACEHOLDER = /(?:todo|stub|placeholder|not\s+implemented)/i;

export function validateAlgorithmMetadata(
  contract: AlgorithmContract,
  metadata: AlgorithmMetadata | undefined,
): string[] {
  const errors: string[] = [];
  if (!metadata) return [`${contract.id}: missing from AlgorithmRegistry`];
  if (metadata.id !== contract.id) errors.push(`${contract.id}: registry identity drifted to ${metadata.id}`);
  if (!metadata.name.trim()) errors.push(`${contract.id}: empty name`);
  if (!metadata.description.trim()) errors.push(`${contract.id}: empty description`);
  if (FORBIDDEN_PLACEHOLDER.test(`${metadata.name} ${metadata.description}`)) errors.push(`${contract.id}: placeholder language present`);
  if (!Number.isFinite(metadata.speedTier) || metadata.speedTier < 0 || metadata.speedTier > 100) errors.push(`${contract.id}: speedTier outside [0, 100]`);
  if (!Number.isFinite(metadata.qualityTier) || metadata.qualityTier < 0 || metadata.qualityTier > 100) errors.push(`${contract.id}: qualityTier outside [0, 100]`);
  if (metadata.supportedProfiles.length === 0) errors.push(`${contract.id}: no execution profile`);
  if (metadata.deploymentProfiles.length === 0) errors.push(`${contract.id}: no deployment profile`);
  if (new Set(metadata.supportedProfiles).size !== metadata.supportedProfiles.length) errors.push(`${contract.id}: duplicate execution profiles`);
  if (new Set(metadata.deploymentProfiles).size !== metadata.deploymentProfiles.length) errors.push(`${contract.id}: duplicate deployment profiles`);
  const parameterNames = metadata.parameters.map((parameter) => parameter.name);
  if (new Set(parameterNames).size !== parameterNames.length) errors.push(`${contract.id}: duplicate parameters`);
  for (const parameter of metadata.parameters) {
    if (!parameter.name.trim() || !parameter.description.trim()) errors.push(`${contract.id}: malformed parameter metadata`);
    if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) errors.push(`${contract.id}: parameter ${parameter.name} has min > max`);
    if (parameter.type === 'select' && (!parameter.options || parameter.options.length === 0)) errors.push(`${contract.id}: select parameter ${parameter.name} has no options`);
  }
  return errors;
}
