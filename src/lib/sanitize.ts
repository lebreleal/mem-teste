/**
 * Centralized HTML sanitization using DOMPurify.
 * Use this instead of raw dangerouslySetInnerHTML to prevent XSS.
 */
import DOMPurify from 'dompurify';

/** Sanitize HTML string, allowing safe tags for rich content (bold, italic, images, lists, etc.) */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return dirty;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'b', 'i', 'u', 's', 'em', 'strong', 'code', 'pre', 'br', 'p', 'div', 'span',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'hr', 'sub', 'sup', 'mark',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel', 'width', 'height', 'data-cloze-id'],
    ALLOW_DATA_ATTR: false,
  });
}
