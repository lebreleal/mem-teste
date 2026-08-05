/**
 * Pure helpers to derive a *visual* preview (thumbnail + clean text) from a
 * card's stored content.
 *
 * Card content is heterogeneous:
 *  - basic cards: HTML (may contain <img>)
 *  - image occlusion: JSON `{"imageUrl": "...", "allRects": [...]}`
 *  - multiple choice / cloze: JSON or HTML with markers
 *
 * Lists must never render raw JSON to the user, and must never rely solely on
 * `card_type` (legacy rows were saved with a generic type while holding
 * occlusion JSON). These helpers normalise both problems in one place.
 */

export interface CardPreview {
  /** First image found in the content, if any. */
  imageUrl: string | null;
  /** Human-readable text, never raw JSON/HTML. */
  text: string;
  /** True when the payload is an image-occlusion object. */
  isOcclusion: boolean;
  /** Number of hidden rects (occlusion only). */
  rectCount: number;
}

const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["']/i;

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Safe JSON parse that only accepts objects. */
function parseObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function getCardPreview(content: string | null | undefined, cardType?: string | null): CardPreview {
  const raw = content ?? '';
  if (!raw) return { imageUrl: null, text: '', isOcclusion: false, rectCount: 0 };

  const obj = parseObject(raw);

  if (obj) {
    const imageUrl = typeof obj.imageUrl === 'string' ? obj.imageUrl : null;
    const rects = Array.isArray(obj.allRects) ? obj.allRects : Array.isArray(obj.rects) ? obj.rects : [];
    const isOcclusion = !!imageUrl || cardType === 'image_occlusion';

    if (isOcclusion) {
      // Prefer the author's own question text; never surface internal counters
      // like "N áreas ocultas" — the thumbnail already says it's an occlusion.
      const frontText = typeof obj.frontText === 'string' ? stripTags(obj.frontText) : '';
      return {
        imageUrl,
        text: frontText,
        isOcclusion: true,
        rectCount: rects.length,
      };
    }


    // Non-occlusion JSON payloads (multiple choice, cloze metadata, ...).
    const question = typeof obj.question === 'string' ? obj.question
      : typeof obj.text === 'string' ? obj.text
      : typeof obj.extra === 'string' ? obj.extra
      : '';
    if (question) {
      const inner = getCardPreview(question);
      return { ...inner, isOcclusion: false };
    }
    if (Array.isArray(obj.options)) {
      return { imageUrl: null, text: (obj.options as unknown[]).filter(o => typeof o === 'string').join(' · '), isOcclusion: false, rectCount: 0 };
    }
    // Unknown JSON shape — never leak it to the UI.
    return { imageUrl: null, text: '', isOcclusion: false, rectCount: 0 };
  }

  const imgMatch = raw.match(IMG_TAG_RE);
  const text = stripTags(raw);
  // No "Imagem" placeholder: an image-only card shows its thumbnail, and a
  // redundant label next to it is exactly the inconsistency reported in lists.
  return {
    imageUrl: imgMatch ? imgMatch[1] : null,
    text,
    isOcclusion: false,
    rectCount: 0,
  };

}

/**
 * Human-readable answer text for a card, whatever shape `back_content` has:
 * plain HTML, `{ clozeTarget, extra }` (cloze / occlusion) or
 * `{ options, correctIndex }` (multiple choice). Never leaks raw JSON.
 */
export function getCardBackText(card: { back_content?: string | null; card_type?: string | null }): string {
  const raw = card.back_content ?? '';
  if (!raw) return '';
  const obj = parseObject(raw);
  if (obj) {
    if (typeof obj.extra === 'string') return getCardPreview(obj.extra).text;
    if (Array.isArray(obj.options)) {
      const opts = (obj.options as unknown[]).filter(o => typeof o === 'string') as string[];
      const idx = typeof obj.correctIndex === 'number' ? obj.correctIndex : -1;
      return idx >= 0 && opts[idx] ? opts[idx] : opts.join(' · ');
    }
    return getCardPreview(raw, card.card_type).text;
  }
  return getCardPreview(raw, card.card_type).text;
}

/**
 * Left status border colour, shared by every card list so the colour a user
 * sees while editing matches the one in the deck listing.
 */
export function getCardStatusBorder(card: { state?: number | null; last_rating?: number | null; difficulty?: number | null }): string {
  if ((card.state === 0 || card.state == null) && card.last_rating == null) return 'border-l-muted-foreground/40';
  const lr = card.last_rating;
  if (lr != null) {
    if (lr === 1) return 'border-l-destructive';
    if (lr === 2) return 'border-l-warning';
    if (lr === 3) return 'border-l-success';
    return 'border-l-info';
  }
  const d = card.difficulty ?? 5;
  if (d <= 3) return 'border-l-info';
  if (d <= 5) return 'border-l-success';
  if (d <= 7) return 'border-l-warning';
  return 'border-l-destructive';
}
