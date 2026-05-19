import { describe, it, expect } from 'vitest';
import { EXIT_CODES, translateContractExitCode } from '../exit-codes.js';

describe('Gap-8: Unified Exit Code Documentation', () => {
  it('should have success exit code = 0', () => {
    expect(EXIT_CODES.success).toBe(0);
  });

  it('should have config_error exit code = 1', () => {
    expect(EXIT_CODES.config_error).toBe(1);
  });

  it('should have source_error exit code = 2', () => {
    expect(EXIT_CODES.source_error).toBe(2);
  });

  it('should have execution_error exit code = 3', () => {
    expect(EXIT_CODES.execution_error).toBe(3);
  });

  it('should have partial_failure exit code = 4', () => {
    expect(EXIT_CODES.partial_failure).toBe(4);
  });

  it('should have system_error exit code = 5', () => {
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('should have conformance_fail exit code = 6', () => {
    expect(EXIT_CODES.conformance_fail).toBe(6);
  });

  it('should translate 200-299 contract codes to config_error (1)', () => {
    expect(translateContractExitCode(201)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(250)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(299)).toBe(EXIT_CODES.config_error);
  });

  it('should translate 300-399 contract codes to source_error (2)', () => {
    expect(translateContractExitCode(301)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(350)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(399)).toBe(EXIT_CODES.source_error);
  });

  it('should translate 400-499 contract codes to execution_error (3)', () => {
    expect(translateContractExitCode(401)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(450)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(499)).toBe(EXIT_CODES.execution_error);
  });

  it('should translate 500-599 contract codes to execution_error (3)', () => {
    expect(translateContractExitCode(501)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(550)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(599)).toBe(EXIT_CODES.execution_error);
  });

  it('should translate 600-699 contract codes to partial_failure (4)', () => {
    expect(translateContractExitCode(601)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(650)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(699)).toBe(EXIT_CODES.partial_failure);
  });

  it('should translate 700-799 contract codes to system_error (5)', () => {
    expect(translateContractExitCode(701)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(750)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(799)).toBe(EXIT_CODES.system_error);
  });
});
