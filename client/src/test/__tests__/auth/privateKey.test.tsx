import { describe, it, expect } from 'vitest';
import {
  normalizePrivateKey,
  isValidPrivateKey,
  maskPrivateKey,
} from '../../../auth/privateKey';

describe('privateKey utils', () => {
  const validKey = '0x' + 'a'.repeat(64);
  const keyWithout0x = 'a'.repeat(64);

  describe('normalizePrivateKey', () => {
    it('should normalize key with 0x prefix', () => {
      expect(normalizePrivateKey(validKey)).toBe(validKey);
    });

    it('should add 0x prefix if missing', () => {
      expect(normalizePrivateKey(keyWithout0x)).toBe(validKey);
    });

    it('should handle uppercase 0X prefix', () => {
      const key = '0X' + 'a'.repeat(64);
      expect(normalizePrivateKey(key)).toBe(validKey);
    });

    it('should trim whitespace', () => {
      expect(normalizePrivateKey(`  ${validKey}  `)).toBe(validKey);
    });

    it('should return empty string for empty input', () => {
      expect(normalizePrivateKey('')).toBe('');
      expect(normalizePrivateKey('   ')).toBe('');
    });

    it('should handle invalid formats', () => {
      const invalid = '0x123'; // too short
      expect(normalizePrivateKey(invalid)).toBe(invalid);
    });
  });

  describe('isValidPrivateKey', () => {
    it('should validate correct private key', () => {
      expect(isValidPrivateKey(validKey)).toBe(true);
    });

    it('should reject key without 0x prefix', () => {
      expect(isValidPrivateKey(keyWithout0x)).toBe(false);
    });

    it('should reject too short key', () => {
      expect(isValidPrivateKey('0x' + 'a'.repeat(63))).toBe(false);
    });

    it('should reject too long key', () => {
      expect(isValidPrivateKey('0x' + 'a'.repeat(65))).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(isValidPrivateKey('0x' + 'g'.repeat(64))).toBe(false);
    });

    it('should accept mixed case hex', () => {
      const mixedKey = '0x' + 'aAbBcC'.repeat(10) + 'aaaa';
      expect(isValidPrivateKey(mixedKey)).toBe(true);
    });
  });

  describe('maskPrivateKey', () => {
    it('should mask valid private key', () => {
      const masked = maskPrivateKey(validKey);
      expect(masked).toMatch(/^0xaaaa…aaaa$/);
    });

    it('should return input if invalid', () => {
      const invalid = '0x123';
      expect(maskPrivateKey(invalid)).toBe(invalid);
    });

    it('should show first 6 and last 4 characters', () => {
      const key = '0x' + '1234567890abcdef'.repeat(4);
      const masked = maskPrivateKey(key);
      expect(masked.startsWith('0x1234')).toBe(true);
      expect(masked.endsWith('cdef')).toBe(true);
      expect(masked).toContain('…');
    });
  });
});