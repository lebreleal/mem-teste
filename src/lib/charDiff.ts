/**
 * Character-level diff highlighting.
 * Returns JSX-ready segments marking added/removed/unchanged text.
 */

export interface DiffSegment {
  text: string;
  type: 'same' | 'added' | 'removed';
}

/**
 * Simple LCS-based char diff between two plain-text strings.
 * Returns two arrays: one for the "old" text (with removed highlights)
 * and one for the "new" text (with added highlights).
 */
export function charDiff(oldStr: string, newStr: string): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } {
  if (oldStr === newStr) {
    return {
      oldSegments: [{ text: oldStr, type: 'same' }],
      newSegments: [{ text: newStr, type: 'same' }],
    };
  }

  // Find common prefix
  let prefixLen = 0;
  while (prefixLen < oldStr.length && prefixLen < newStr.length && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix (after prefix)
  let suffixLen = 0;
  while (
    suffixLen < oldStr.length - prefixLen &&
    suffixLen < newStr.length - prefixLen &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = oldStr.slice(0, prefixLen);
  const suffix = oldStr.slice(oldStr.length - suffixLen || undefined);
  const oldMiddle = oldStr.slice(prefixLen, oldStr.length - suffixLen || undefined);
  const newMiddle = newStr.slice(prefixLen, newStr.length - suffixLen || undefined);

  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];

  if (prefix) {
    oldSegments.push({ text: prefix, type: 'same' });
    newSegments.push({ text: prefix, type: 'same' });
  }
  if (oldMiddle) oldSegments.push({ text: oldMiddle, type: 'removed' });
  if (newMiddle) newSegments.push({ text: newMiddle, type: 'added' });
  if (suffix && suffixLen > 0) {
    oldSegments.push({ text: suffix, type: 'same' });
    newSegments.push({ text: suffix, type: 'same' });
  }

  return { oldSegments, newSegments };
}
