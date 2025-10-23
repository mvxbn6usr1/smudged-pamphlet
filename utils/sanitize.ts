import DOMPurify from 'dompurify';

/**
 * Sanitizes user input to prevent XSS attacks
 * Allows basic formatting tags but removes scripts and dangerous attributes
 */
export function sanitizeUserInput(input: string): string {
  if (typeof window === 'undefined') {
    // Server-side: just strip HTML tags
    return input.replace(/<[^>]*>/g, '');
  }

  // Client-side: use DOMPurify
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes text for display (stricter - no HTML at all)
 */
export function sanitizeText(text: string): string {
  if (typeof window === 'undefined') {
    return text.replace(/<[^>]*>/g, '');
  }

  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes username (alphanumeric and basic punctuation only)
 */
export function sanitizeUsername(username: string): string {
  return username
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .slice(0, 50); // Limit length
}
