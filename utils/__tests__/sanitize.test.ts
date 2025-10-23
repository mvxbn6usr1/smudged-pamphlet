/**
 * @jest-environment jsdom
 */
import { sanitizeUsername, sanitizeText } from '../sanitize';

describe('Sanitization Utility', () => {
  describe('sanitizeUsername', () => {
    it('should allow alphanumeric characters', () => {
      expect(sanitizeUsername('User123')).toBe('User123');
    });

    it('should allow underscores and hyphens', () => {
      expect(sanitizeUsername('user_name-123')).toBe('user_name-123');
    });

    it('should remove special characters', () => {
      expect(sanitizeUsername('user@name!')).toBe('username');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeUsername('<script>alert()</script>test')).toBe('scriptalertscripttest');
    });

    it('should trim whitespace', () => {
      expect(sanitizeUsername('  username  ')).toBe('username');
    });

    it('should limit length to 50 characters', () => {
      const longName = 'a'.repeat(100);
      expect(sanitizeUsername(longName).length).toBe(50);
    });

    it('should handle empty string', () => {
      expect(sanitizeUsername('')).toBe('');
    });
  });

  describe('sanitizeText', () => {
    it('should allow plain text', () => {
      expect(sanitizeText('Hello world')).toBe('Hello world');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeText('<p>Hello</p>')).toBe('Hello');
    });

    it('should remove script tags', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('');
    });

    it('should handle multiple tags', () => {
      expect(sanitizeText('<b>Bold</b> <i>Italic</i>')).toBe('Bold Italic');
    });

    it('should preserve content when removing tags', () => {
      expect(sanitizeText('<div>Content</div>')).toBe('Content');
    });

    it('should handle empty string', () => {
      expect(sanitizeText('')).toBe('');
    });

    it('should handle special characters', () => {
      expect(sanitizeText('Test & <test>')).toBe('Test &amp; ');
    });
  });
});
