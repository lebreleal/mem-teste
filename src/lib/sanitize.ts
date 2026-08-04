/**
 * Centralized HTML sanitization using DOMPurify.
 * Use this instead of raw dangerouslySetInnerHTML to prevent XSS.
 *
 * Performance (Lei 1F): every <img> produced here gets `decoding="async"` and,
 * by default, `loading="lazy"`. The only exception is the active study card,
 * which must render eagerly with high priority — pass { eager: true } there.
 */
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'b', 'i', 'u', 's', 'em', 'strong', 'code', 'pre', 'br', 'p', 'div', 'span',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'hr', 'sub', 'sup', 'mark',
  // Image occlusion SVG
  'svg', 'rect', 'ellipse', 'polygon',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'class', 'style', 'target', 'rel', 'width', 'height', 'data-cloze-id',
  // Image loading hints (Lei 1F)
  'loading', 'decoding', 'fetchpriority',
  // SVG attrs for occlusion
  'viewBox', 'preserveAspectRatio', 'x', 'y', 'cx', 'cy', 'rx', 'ry', 'points', 'fill', 'stroke', 'stroke-width',
];

let eagerMode = false;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName !== 'IMG') return;
  const el = node as unknown as Element;
  el.setAttribute('decoding', 'async');
  if (eagerMode) {
    el.setAttribute('loading', 'eager');
    el.setAttribute('fetchpriority', 'high');
  } else {
    el.setAttribute('loading', 'lazy');
    el.removeAttribute('fetchpriority');
  }
});

export interface SanitizeOptions {
  /** Render images eagerly with high priority — use only for the active study card. */
  eager?: boolean;
}

/** Sanitize HTML string, allowing safe tags for rich content (bold, italic, images, lists, etc.) */
export function sanitizeHtml(dirty: string, options?: SanitizeOptions): string {
  if (!dirty) return dirty;
  eagerMode = options?.eager === true;
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    });
  } finally {
    eagerMode = false;
  }
}
