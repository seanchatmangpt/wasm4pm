/**
 * profile-guide.test.ts
 * Tests for profile guide recommendation engine
 */

import { describe, it, expect } from 'vitest';
import {
  recommendProfile,
  formatRecommendation,
  type ProfileGuideResponse,
  type ProfileRecommendation,
} from '../profile-guide.js';

describe('Profile Guide', () => {
  describe('recommendProfile', () => {
    it('should recommend mobile for mobile constraint', () => {
      const response: ProfileGuideResponse = {
        logSize: 'small',
        needsML: false,
        sizeConstrained: 'mobile',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('mobile');
      expect(rec.sizeEstimate).toBe('~500KB');
      expect(rec.reasoning).toContain('mobile');
    });

    it('should recommend iot for iot constraint', () => {
      const response: ProfileGuideResponse = {
        logSize: 'medium',
        needsML: false,
        sizeConstrained: 'iot',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('iot');
      expect(rec.sizeEstimate).toBe('~1MB');
    });

    it('should recommend browser for browser constraint with ML', () => {
      const response: ProfileGuideResponse = {
        logSize: 'small',
        needsML: true,
        sizeConstrained: 'browser',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('browser');
      expect(rec.features.some((f) => f.includes('ML'))).toBe(true);
    });

    it('should recommend browser for browser constraint without ML', () => {
      const response: ProfileGuideResponse = {
        logSize: 'small',
        needsML: false,
        sizeConstrained: 'browser',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('browser');
    });

    it('should recommend fog for large logs with ML and no size constraint', () => {
      const response: ProfileGuideResponse = {
        logSize: 'large',
        needsML: true,
        sizeConstrained: 'none',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('fog');
      expect(rec.sizeEstimate).toBe('~2MB');
      expect(rec.features.some((f) => f.includes('ML'))).toBe(true);
    });

    it('should recommend edge for large logs without ML and no size constraint', () => {
      const response: ProfileGuideResponse = {
        logSize: 'large',
        needsML: false,
        sizeConstrained: 'none',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('edge');
      expect(rec.sizeEstimate).toBe('~1.5MB');
    });

    it('should recommend browser for small logs with ML and no size constraint', () => {
      const response: ProfileGuideResponse = {
        logSize: 'small',
        needsML: true,
        sizeConstrained: 'none',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('browser');
    });

    it('should recommend browser for medium logs without ML and no size constraint', () => {
      const response: ProfileGuideResponse = {
        logSize: 'medium',
        needsML: false,
        sizeConstrained: 'none',
      };
      const rec = recommendProfile(response);

      expect(rec.profile).toBe('browser');
    });

    it('should include features list for every recommendation', () => {
      const responses: ProfileGuideResponse[] = [
        { logSize: 'small', needsML: false, sizeConstrained: 'mobile' },
        { logSize: 'medium', needsML: true, sizeConstrained: 'iot' },
        { logSize: 'large', needsML: false, sizeConstrained: 'none' },
      ];

      for (const response of responses) {
        const rec = recommendProfile(response);
        expect(rec.features).toBeDefined();
        expect(Array.isArray(rec.features)).toBe(true);
        expect(rec.features.length).toBeGreaterThan(0);
      }
    });

    it('should include tradeoffs for every recommendation', () => {
      const responses: ProfileGuideResponse[] = [
        { logSize: 'small', needsML: false, sizeConstrained: 'mobile' },
        { logSize: 'large', needsML: true, sizeConstrained: 'none' },
      ];

      for (const response of responses) {
        const rec = recommendProfile(response);
        expect(rec.tradeoffs).toBeDefined();
        expect(Array.isArray(rec.tradeoffs)).toBe(true);
      }
    });

    it('should include next steps for every recommendation', () => {
      const responses: ProfileGuideResponse[] = [
        { logSize: 'small', needsML: false, sizeConstrained: 'mobile' },
        { logSize: 'large', needsML: true, sizeConstrained: 'none' },
      ];

      for (const response of responses) {
        const rec = recommendProfile(response);
        expect(rec.nextSteps).toBeDefined();
        expect(Array.isArray(rec.nextSteps)).toBe(true);
        expect(rec.nextSteps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('formatRecommendation', () => {
    it('should format recommendation as human-readable string', () => {
      const rec: ProfileRecommendation = {
        profile: 'browser',
        reasoning: 'Test recommendation',
        sizeEstimate: '~2.7MB',
        features: ['Feature 1', 'Feature 2'],
        tradeoffs: ['Tradeoff 1'],
        nextSteps: ['Step 1'],
      };

      const formatted = formatRecommendation(rec);

      expect(typeof formatted).toBe('string');
      // Remove ANSI color codes for testing
      const cleanFormatted = formatted.replace(/\x1b\[[0-9;]*m/g, '');
      expect(cleanFormatted).toContain('BROWSER'); // Profile name is uppercased
      expect(cleanFormatted).toContain('Test recommendation');
      expect(cleanFormatted).toContain('~2.7MB');
      expect(cleanFormatted).toContain('Feature 1');
      expect(cleanFormatted).toContain('Feature 2');
    });

    it('should include all recommendation components in formatted output', () => {
      const rec: ProfileRecommendation = {
        profile: 'fog',
        reasoning: 'Fog is best for your needs',
        sizeEstimate: '~2MB',
        features: ['Discovery', 'ML', 'Streaming'],
        tradeoffs: ['No POWL'],
        nextSteps: ['Run wpm run', 'Try quality profile'],
      };

      const formatted = formatRecommendation(rec);
      // Remove ANSI color codes for testing
      const cleanFormatted = formatted.replace(/\x1b\[[0-9;]*m/g, '');

      expect(cleanFormatted).toContain('FOG');
      expect(cleanFormatted).toContain('~2MB');
      expect(cleanFormatted).toContain('Discovery');
      expect(cleanFormatted).toContain('ML');
      expect(cleanFormatted).toContain('Streaming');
      expect(cleanFormatted).toContain('No POWL');
      expect(cleanFormatted).toContain('Run wpm run');
    });
  });

  describe('Profile selection logic', () => {
    it('should hard-enforce mobile constraint regardless of other answers', () => {
      const mobileAnswers: ProfileGuideResponse[] = [
        { logSize: 'small', needsML: false, sizeConstrained: 'mobile' },
        { logSize: 'medium', needsML: true, sizeConstrained: 'mobile' },
        { logSize: 'large', needsML: true, sizeConstrained: 'mobile' },
      ];

      for (const answer of mobileAnswers) {
        const rec = recommendProfile(answer);
        expect(rec.profile).toBe('mobile');
      }
    });

    it('should hard-enforce iot constraint regardless of other answers', () => {
      const iotAnswers: ProfileGuideResponse[] = [
        { logSize: 'small', needsML: false, sizeConstrained: 'iot' },
        { logSize: 'large', needsML: true, sizeConstrained: 'iot' },
      ];

      for (const answer of iotAnswers) {
        const rec = recommendProfile(answer);
        expect(rec.profile).toBe('iot');
      }
    });

    it('should recommend fog when large logs with ML and no constraint', () => {
      const rec = recommendProfile({
        logSize: 'large',
        needsML: true,
        sizeConstrained: 'none',
      });

      expect(rec.profile).toBe('fog');
      expect(rec.sizeEstimate).toBe('~2MB');
    });

    it('should recommend edge when large logs without ML and no constraint', () => {
      const rec = recommendProfile({
        logSize: 'large',
        needsML: false,
        sizeConstrained: 'none',
      });

      expect(rec.profile).toBe('edge');
      expect(rec.sizeEstimate).toBe('~1.5MB');
    });
  });
});
