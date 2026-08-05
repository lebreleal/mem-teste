/**
 * Single source of truth for image-occlusion card payloads.
 *
 * Data model: one card per DISTINCT COLOR (not per shape). Shapes sharing a
 * color are revealed together; each color becomes a sibling card identified by
 * `clozeTarget`.
 *
 * Numbering: occlusion colors live in their own numeric range (>= 101) so they
 * never collide with text clozes ({{c1::}}, {{c2::}}...). Legacy cards stored
 * colors as `paletteIndex + 1` (1..12) — reading still supports that.
 */

import { OCCLUSION_COLORS } from '@/lib/occlusionColors';

/** Occlusion numbers start here so they never collide with text cloze numbers. */
export const OCCLUSION_NUM_BASE = 100;

export interface OcclusionShapeLike {
  id: string;
  color?: string;
}


export interface OcclusionPayload {
  imageUrl?: string;
  allRects?: OcclusionShapeLike[];
  rects?: OcclusionShapeLike[];
  activeRectIds?: string[];
  colorGroups?: Record<string, string[]>;
  /** color -> occlusion number (new format) */
  colorNums?: Record<string, number>;
  canvasWidth?: number;
  canvasHeight?: number;
  frontText?: string;
}

export const DEFAULT_OCCLUSION_FILL = OCCLUSION_COLORS[0].fill;

const shapeColor = (s: OcclusionShapeLike) => s.color || DEFAULT_OCCLUSION_FILL;

/** Distinct colors, in first-appearance order. */
export function distinctColors(rects: OcclusionShapeLike[]): string[] {
  const out: string[] = [];
  for (const r of rects) {
    const c = shapeColor(r);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** How many cards a given set of shapes will produce (1 per distinct color). */
export function countOcclusionGroups(rects: OcclusionShapeLike[]): number {
  return distinctColors(rects).length;
}

/**
 * Map each color to a stable occlusion number.
 * Palette colors keep a deterministic number; unknown/legacy colors get the
 * next free slot instead of being silently dropped (old code used findIndex and
 * discarded -1).
 */
export function buildColorNums(rects: OcclusionShapeLike[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();

  for (const color of distinctColors(rects)) {
    const idx = OCCLUSION_COLORS.findIndex(c => c.fill === color);
    if (idx >= 0) {
      const num = OCCLUSION_NUM_BASE + idx + 1;
      map[color] = num;
      used.add(num);
    }
  }

  let next = OCCLUSION_NUM_BASE + OCCLUSION_COLORS.length + 1;
  for (const color of distinctColors(rects)) {
    if (map[color] != null) continue;
    while (used.has(next)) next++;
    map[color] = next;
    used.add(next);
    next++;
  }

  return map;
}

/** Group shape ids by color (used by renderers and legacy consumers). */
export function buildColorGroups(rects: OcclusionShapeLike[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const r of rects) {
    const c = shapeColor(r);
    (groups[c] ||= []).push(r.id);
  }
  return groups;
}

/** All occlusion numbers produced by these shapes, sorted. */
export function occlusionNums(rects: OcclusionShapeLike[]): number[] {
  return Object.values(buildColorNums(rects)).sort((a, b) => a - b);
}

/** Build the canonical `front_content` JSON for an occlusion card. */
export function buildOcclusionFront(params: {
  imageUrl: string;
  rects: OcclusionShapeLike[];
  canvasSize?: { w: number; h: number } | null;
  frontText?: string;
}): string {
  const { imageUrl, rects, canvasSize, frontText } = params;
  return JSON.stringify({
    imageUrl,
    allRects: rects,
    rects,
    activeRectIds: rects.map(r => r.id),
    colorGroups: buildColorGroups(rects),
    colorNums: buildColorNums(rects),
    canvasWidth: canvasSize?.w ?? 0,
    canvasHeight: canvasSize?.h ?? 0,
    ...(frontText ? { frontText } : {}),
  });
}

/**
 * Resolve which color a sibling card (`clozeTarget`) refers to.
 * Handles the new `colorNums` map and legacy `paletteIndex + 1` numbering.
 */
export function colorForOcclusionTarget(data: OcclusionPayload, target: number): string | undefined {
  if (!target || target <= 0) return undefined;

  if (data.colorNums) {
    for (const [color, num] of Object.entries(data.colorNums)) {
      if (num === target) return color;
    }
  }

  // Legacy: numbers 1..N were palette indexes.
  if (target <= OCCLUSION_NUM_BASE) return OCCLUSION_COLORS[target - 1]?.fill;

  // New-range number on a card saved before colorNums existed.
  return OCCLUSION_COLORS[target - OCCLUSION_NUM_BASE - 1]?.fill;
}

/** True when the number belongs to the occlusion range (not a text cloze). */
export function isOcclusionNum(num: number): boolean {
  return num > OCCLUSION_NUM_BASE;
}

/**
 * Cloze "extra" must not repeat the front sentence. When the back text is just the
 * front without the {{cN::...}} markers, the extra is dropped (empty string).
 */
export function normalizeClozeExtra(frontContent: string, backContent: string): string {
  const clean = (s: string) =>
    (s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const back = clean(backContent);
  if (!back) return '';
  return back === clean(frontContent) ? '' : backContent;
}
