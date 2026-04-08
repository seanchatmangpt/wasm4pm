import { describe, it, expect } from 'vitest';
import { trackProvenance, mergeProvenance, type ProvenanceMap } from '../provenance.js';

describe('Provenance', () => {
  describe('trackProvenance', () => {
    it('tracks flat keys', () => {
      const map = trackProvenance({ version: '1.0.0', schemaVersion: 1 }, 'default');
      expect(map['version']).toEqual({ value: '1.0.0', source: 'default' });
      expect(map['schemaVersion']).toEqual({ value: 1, source: 'default' });
    });

    it('tracks nested keys with dot notation', () => {
      const map = trackProvenance(
        { execution: { profile: 'fast', timeout: 60000 } },
        'toml',
        './pictl.toml',
      );
      expect(map['execution.profile']).toEqual({
        value: 'fast',
        source: 'toml',
        path: './pictl.toml',
      });
      expect(map['execution.timeout']).toEqual({
        value: 60000,
        source: 'toml',
        path: './pictl.toml',
      });
    });

    it('tracks deeply nested keys', () => {
      const map = trackProvenance(
        { observability: { otel: { enabled: true, endpoint: 'http://localhost:4318' } } },
        'json',
        './config.json',
      );
      expect(map['observability.otel.enabled']).toEqual({
        value: true,
        source: 'json',
        path: './config.json',
      });
      expect(map['observability.otel.endpoint']).toEqual({
        value: 'http://localhost:4318',
        source: 'json',
        path: './config.json',
      });
    });

    it('skips undefined and null values', () => {
      const map = trackProvenance({ a: undefined, b: null, c: 'ok' } as any, 'env');
      expect(map['a']).toBeUndefined();
      expect(map['b']).toBeUndefined();
      expect(map['c']).toEqual({ value: 'ok', source: 'env' });
    });

    it('tracks arrays as leaf values', () => {
      const map = trackProvenance({ tags: ['a', 'b'] }, 'cli');
      expect(map['tags']).toEqual({ value: ['a', 'b'], source: 'cli' });
    });

    it('includes file path only when provided', () => {
      const withPath = trackProvenance({ x: 1 }, 'toml', '/etc/config.toml');
      expect(withPath['x'].path).toBe('/etc/config.toml');

      const withoutPath = trackProvenance({ x: 1 }, 'default');
      expect(withoutPath['x'].path).toBeUndefined();
    });

    it('handles empty object', () => {
      const map = trackProvenance({}, 'default');
      expect(Object.keys(map)).toHaveLength(0);
    });

    it('records each of the five source types', () => {
      const sources = ['cli', 'toml', 'json', 'env', 'default'] as const;
      for (const source of sources) {
        const map = trackProvenance({ k: source }, source);
        expect(map['k'].source).toBe(source);
      }
    });
  });

  describe('mergeProvenance', () => {
    it('merges non-overlapping maps', () => {
      const a: ProvenanceMap = { 'x': { value: 1, source: 'default' } };
      const b: ProvenanceMap = { 'y': { value: 2, source: 'env' } };
      const merged = mergeProvenance(a, b);
      expect(merged['x'].source).toBe('default');
      expect(merged['y'].source).toBe('env');
    });

    it('later maps override earlier for same key', () => {
      const defaults: ProvenanceMap = {
        'execution.profile': { value: 'balanced', source: 'default' },
      };
      const env: ProvenanceMap = {
        'execution.profile': { value: 'fast', source: 'env' },
      };
      const cli: ProvenanceMap = {
        'execution.profile': { value: 'quality', source: 'cli' },
      };

      const merged = mergeProvenance(defaults, env, cli);
      expect(merged['execution.profile'].source).toBe('cli');
      expect(merged['execution.profile'].value).toBe('quality');
    });

    it('preserves keys not overridden', () => {
      const defaults: ProvenanceMap = {
        'version': { value: '1.0.0', source: 'default' },
        'execution.profile': { value: 'balanced', source: 'default' },
      };
      const toml: ProvenanceMap = {
        'execution.profile': { value: 'fast', source: 'toml', path: './c.toml' },
      };

      const merged = mergeProvenance(defaults, toml);
      expect(merged['version'].source).toBe('default');
      expect(merged['execution.profile'].source).toBe('toml');
    });

    it('handles empty maps', () => {
      const a: ProvenanceMap = { k: { value: 1, source: 'default' } };
      const merged = mergeProvenance({}, a, {});
      expect(merged['k'].source).toBe('default');
    });

    it('preserves file path through merges', () => {
      const a: ProvenanceMap = {
        'x': { value: 1, source: 'toml', path: '/a.toml' },
      };
      const b: ProvenanceMap = {
        'y': { value: 2, source: 'json', path: '/b.json' },
      };
      const merged = mergeProvenance(a, b);
      expect(merged['x'].path).toBe('/a.toml');
      expect(merged['y'].path).toBe('/b.json');
    });

    it('follows resolution order: default < env < toml/json < cli', () => {
      const layers: ProvenanceMap[] = [
        { 'k': { value: 'd', source: 'default' } },
        { 'k': { value: 'e', source: 'env' } },
        { 'k': { value: 't', source: 'toml' } },
        { 'k': { value: 'c', source: 'cli' } },
      ];
      const merged = mergeProvenance(...layers);
      expect(merged['k'].source).toBe('cli');
      expect(merged['k'].value).toBe('c');
    });
  });
});
