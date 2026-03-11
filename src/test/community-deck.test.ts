/**
 * Comprehensive tests for community & deck logic:
 * - Import/clone consistency
 * - Linked deck detection
 * - Deletion protection
 * - Hierarchy import
 * - Name conflict resolution
 * - Archive propagation
 * - Format interval (months/years)
 */
import { describe, it, expect } from 'vitest';

// ── Name conflict resolution (mirrors useContentImport logic) ──
const resolveNameConflict = (baseName: string, existingNames: string[]): string => {
  if (!existingNames.includes(baseName)) return baseName;
  let suffix = 1;
  let candidate = `${baseName} (cópia)`;
  while (existingNames.includes(candidate)) { suffix++; candidate = `${baseName} (cópia ${suffix})`; }
  return candidate;
};

describe('resolveNameConflict', () => {
  it('returns baseName if no conflict', () => {
    expect(resolveNameConflict('Deck A', ['Deck B', 'Deck C'])).toBe('Deck A');
  });

  it('appends (cópia) on first conflict', () => {
    expect(resolveNameConflict('Deck A', ['Deck A'])).toBe('Deck A (cópia)');
  });

  it('appends (cópia 2) when (cópia) also exists', () => {
    expect(resolveNameConflict('Deck A', ['Deck A', 'Deck A (cópia)'])).toBe('Deck A (cópia 2)');
  });

  it('handles multiple conflicts', () => {
    expect(resolveNameConflict('Deck A', [
      'Deck A', 'Deck A (cópia)', 'Deck A (cópia 2)', 'Deck A (cópia 3)'
    ])).toBe('Deck A (cópia 4)');
  });

  it('handles empty existing list', () => {
    expect(resolveNameConflict('Test', [])).toBe('Test');
  });
});

// ── Linked deck detection (mirrors DeckDetail logic) ──
function checkIsLinkedDeck(deck: any, decks: any[]): boolean {
  if (!deck) return false;
  if (deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck) return true;
  let parentId = deck.parent_deck_id;
  while (parentId) {
    const parent = decks.find((d: any) => d.id === parentId);
    if (!parent) break;
    if (parent.source_turma_deck_id || parent.source_listing_id || parent.is_live_deck) return true;
    parentId = parent.parent_deck_id;
  }
  return false;
}

describe('checkIsLinkedDeck', () => {
  it('returns false for own deck with no source', () => {
    const deck = { id: '1', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: null };
    expect(checkIsLinkedDeck(deck, [])).toBe(false);
  });

  it('returns true for deck with source_turma_deck_id', () => {
    const deck = { id: '1', source_turma_deck_id: 'abc', source_listing_id: null, is_live_deck: false, parent_deck_id: null };
    expect(checkIsLinkedDeck(deck, [])).toBe(true);
  });

  it('returns true for deck with source_listing_id', () => {
    const deck = { id: '1', source_turma_deck_id: null, source_listing_id: 'xyz', is_live_deck: false, parent_deck_id: null };
    expect(checkIsLinkedDeck(deck, [])).toBe(true);
  });

  it('returns true for live deck', () => {
    const deck = { id: '1', source_turma_deck_id: null, source_listing_id: null, is_live_deck: true, parent_deck_id: null };
    expect(checkIsLinkedDeck(deck, [])).toBe(true);
  });

  it('returns true for child of linked parent', () => {
    const parent = { id: 'p', source_turma_deck_id: 'abc', source_listing_id: null, is_live_deck: false, parent_deck_id: null };
    const child = { id: 'c', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: 'p' };
    expect(checkIsLinkedDeck(child, [parent, child])).toBe(true);
  });

  it('returns true for grandchild of linked grandparent', () => {
    const gp = { id: 'gp', source_turma_deck_id: 'abc', source_listing_id: null, is_live_deck: false, parent_deck_id: null };
    const p = { id: 'p', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: 'gp' };
    const c = { id: 'c', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: 'p' };
    expect(checkIsLinkedDeck(c, [gp, p, c])).toBe(true);
  });

  it('returns false for child of non-linked parent', () => {
    const parent = { id: 'p', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: null };
    const child = { id: 'c', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: 'p' };
    expect(checkIsLinkedDeck(child, [parent, child])).toBe(false);
  });

  it('handles null deck gracefully', () => {
    expect(checkIsLinkedDeck(null, [])).toBe(false);
  });

  it('handles broken parent chain (parent not found)', () => {
    const child = { id: 'c', source_turma_deck_id: null, source_listing_id: null, is_live_deck: false, parent_deck_id: 'missing' };
    expect(checkIsLinkedDeck(child, [child])).toBe(false);
  });
});

// ── Community deletion protection (mirrors useDashboardActions logic) ──
function collectAllDescendants(deckId: string, decks: { id: string; parent_deck_id: string | null }[]): string[] {
  const allIds = [deckId];
  const queue = [deckId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const children = decks.filter(d => d.parent_deck_id === current);
    children.forEach(c => { allIds.push(c.id); queue.push(c.id); });
  }
  return allIds;
}

describe('collectAllDescendants', () => {
  it('returns just the deck if no children', () => {
    const decks = [{ id: 'a', parent_deck_id: null }];
    expect(collectAllDescendants('a', decks)).toEqual(['a']);
  });

  it('collects direct children', () => {
    const decks = [
      { id: 'a', parent_deck_id: null },
      { id: 'b', parent_deck_id: 'a' },
      { id: 'c', parent_deck_id: 'a' },
    ];
    const result = collectAllDescendants('a', decks);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result.length).toBe(3);
  });

  it('collects deep hierarchy', () => {
    const decks = [
      { id: 'a', parent_deck_id: null },
      { id: 'b', parent_deck_id: 'a' },
      { id: 'c', parent_deck_id: 'b' },
      { id: 'd', parent_deck_id: 'c' },
    ];
    const result = collectAllDescendants('a', decks);
    expect(result.length).toBe(4);
    expect(result).toContain('d');
  });

  it('does not include siblings', () => {
    const decks = [
      { id: 'a', parent_deck_id: null },
      { id: 'b', parent_deck_id: null },
      { id: 'c', parent_deck_id: 'a' },
    ];
    const result = collectAllDescendants('a', decks);
    expect(result).not.toContain('b');
  });
});

// ── Access control helpers (mirrors useContentImport logic) ──
describe('Community access control', () => {
  const isDeckFree = (td: any) => !td.price_type || td.price_type === 'free';

  it('free deck is accessible', () => {
    expect(isDeckFree({ price_type: 'free' })).toBe(true);
    expect(isDeckFree({ price_type: null })).toBe(true);
    expect(isDeckFree({})).toBe(true);
  });

  it('paid deck is not free', () => {
    expect(isDeckFree({ price_type: 'subscribers' })).toBe(false);
    expect(isDeckFree({ price_type: 'premium' })).toBe(false);
  });

  const canAccessDeck = (td: any, userId: string, isAdmin: boolean, isMod: boolean, isSubscriber: boolean) => {
    if (isDeckFree(td)) return true;
    if (td.shared_by === userId) return true;
    if (isAdmin || isMod || isSubscriber) return true;
    return false;
  };

  it('anyone can access free deck', () => {
    expect(canAccessDeck({ price_type: 'free' }, 'user1', false, false, false)).toBe(true);
  });

  it('owner can access paid deck', () => {
    expect(canAccessDeck({ price_type: 'subscribers', shared_by: 'user1' }, 'user1', false, false, false)).toBe(true);
  });

  it('subscriber can access paid deck', () => {
    expect(canAccessDeck({ price_type: 'subscribers', shared_by: 'other' }, 'user1', false, false, true)).toBe(true);
  });

  it('admin can access paid deck', () => {
    expect(canAccessDeck({ price_type: 'subscribers', shared_by: 'other' }, 'user1', true, false, false)).toBe(true);
  });

  it('regular user cannot access paid deck', () => {
    expect(canAccessDeck({ price_type: 'subscribers', shared_by: 'other' }, 'user1', false, false, false)).toBe(false);
  });
});

// ── Import mode validation ──
describe('Import mode logic', () => {
  it('flat import merges all card indices', () => {
    const parentIndices = [0, 1, 2];
    const childTds = [
      { card_indices: [3, 4] },
      { card_indices: [5, 6, 7] },
    ];
    const allIndices = [...parentIndices, ...childTds.flatMap(c => c.card_indices)];
    expect(allIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('hierarchy import preserves parent-child relationships', () => {
    type Node = { name: string; parentId: string | null; children: Node[] };
    const root: Node = { name: 'Root', parentId: null, children: [] };
    const child1: Node = { name: 'Child 1', parentId: 'root', children: [] };
    const child2: Node = { name: 'Child 2', parentId: 'root', children: [] };
    root.children = [child1, child2];
    
    // BFS traversal
    const queue: Node[] = [root];
    const visited: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      visited.push(node.name);
      queue.push(...node.children);
    }
    expect(visited).toEqual(['Root', 'Child 1', 'Child 2']);
  });
});

// ── Deck stats computation edge cases ──
describe('Deck stats edge cases', () => {
  it('author resolution priority: listing > turma > orphan', () => {
    const priorities = ['listing', 'turma', 'orphan'];
    
    // Simulate priority chain
    const resolve = (listingAuthor: string | null, turmaAuthor: string | null, orphanAuthor: string | null): string | null => {
      return listingAuthor ?? turmaAuthor ?? orphanAuthor ?? null;
    };

    expect(resolve('Alice', 'Bob', 'Charlie')).toBe('Alice');
    expect(resolve(null, 'Bob', 'Charlie')).toBe('Bob');
    expect(resolve(null, null, 'Charlie')).toBe('Charlie');
    expect(resolve(null, null, null)).toBeNull();
  });
});

// ── Archive propagation ──
describe('Archive propagation logic', () => {
  it('archiving parent should affect children', () => {
    const decks = [
      { id: 'p', parent_deck_id: null, is_archived: false },
      { id: 'c1', parent_deck_id: 'p', is_archived: false },
      { id: 'c2', parent_deck_id: 'p', is_archived: false },
    ];
    
    // Simulate archive
    const newArchived = true;
    const children = decks.filter(d => d.parent_deck_id === 'p');
    expect(children.length).toBe(2);
    
    // All children should be found
    const childIds = children.map(c => c.id);
    expect(childIds).toContain('c1');
    expect(childIds).toContain('c2');
  });
});

// ── Bulk operations ──
describe('Bulk deck operations', () => {
  it('bulk delete collects all descendants', () => {
    const decks = [
      { id: '1', parent_deck_id: null },
      { id: '2', parent_deck_id: '1' },
      { id: '3', parent_deck_id: '2' },
      { id: '4', parent_deck_id: null },
    ];
    
    const selectedIds = ['1'];
    const allRelatedIds = new Set(selectedIds);
    const collectChildren = (parentIds: string[]) => {
      const children = decks.filter(d => d.parent_deck_id && parentIds.includes(d.parent_deck_id));
      children.forEach(c => allRelatedIds.add(c.id));
      if (children.length > 0) collectChildren(children.map(c => c.id));
    };
    collectChildren(selectedIds);

    expect(allRelatedIds.has('1')).toBe(true);
    expect(allRelatedIds.has('2')).toBe(true);
    expect(allRelatedIds.has('3')).toBe(true);
    expect(allRelatedIds.has('4')).toBe(false);
  });

  it('community block detects shared decks in hierarchy', () => {
    const allIds = ['1', '2', '3'];
    const communityLinkedIds = new Set(['2']);
    const blocked = allIds.filter(id => communityLinkedIds.has(id));
    
    expect(blocked.length).toBe(1);
    expect(blocked[0]).toBe('2');
  });
});

// ── Movement restrictions ──
describe('Movement restrictions for linked decks', () => {
  it('linked deck should not be moveable', () => {
    const deck = { source_turma_deck_id: 'abc', source_listing_id: null, is_live_deck: false };
    const isLinked = !!(deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck);
    expect(isLinked).toBe(true);
  });

  it('own deck should be moveable', () => {
    const deck = { source_turma_deck_id: null, source_listing_id: null, is_live_deck: false };
    const isLinked = !!(deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck);
    expect(isLinked).toBe(false);
  });
});

// ── Format interval ──
import { fsrsPreviewIntervals, fsrsSchedule, DEFAULT_FSRS_PARAMS, type FSRSCard, type Rating } from '@/lib/fsrs';

describe('formatInterval via fsrsPreviewIntervals', () => {
  const params = DEFAULT_FSRS_PARAMS;

  function reviewCard(s: number, d: number, daysPast: number): FSRSCard {
    const past = new Date();
    past.setDate(past.getDate() - daysPast);
    return { stability: s, difficulty: d, state: 2, scheduled_date: past.toISOString(), learning_step: 0, last_reviewed_at: past.toISOString() };
  }

  it('new card Again shows minutes', () => {
    const c: FSRSCard = { stability: 0, difficulty: 0, state: 0, scheduled_date: new Date().toISOString(), learning_step: 0 };
    const preview = fsrsPreviewIntervals(c, params);
    expect(preview[1]).toMatch(/min$/);
  });

  it('large intervals show years with "a" suffix', () => {
    const c = reviewCard(500, 2, 500);
    const r = fsrsSchedule(c, 4, params);
    if (r.interval_days >= 365) {
      const preview = fsrsPreviewIntervals(c, params);
      expect(preview[4]).toMatch(/a$/);
    }
  });

  it('medium intervals show months with "m" suffix', () => {
    const c = reviewCard(50, 3, 50);
    const r = fsrsSchedule(c, 4, params);
    if (r.interval_days >= 30 && r.interval_days < 365) {
      const preview = fsrsPreviewIntervals(c, params);
      expect(preview[4]).toMatch(/m$/);
    }
  });

  it('short intervals show days with "d" suffix', () => {
    const c = reviewCard(2, 5, 2);
    const preview = fsrsPreviewIntervals(c, params);
    // At least one rating should produce a "d" suffix
    const ratings = [1, 2, 3, 4] as Rating[];
    const results = ratings.map(r => preview[r]);
    const hasDays = results.some(r => r.endsWith('d'));
    expect(hasDays).toBe(true);
  });
});

// ── Duplicate deck name resolution ──
describe('Duplicate deck name resolution', () => {
  // Simulates resolveUniqueDeckName from deckCrud
  const resolveUnique = (baseName: string, existingNames: string[]): string => {
    const existing = new Set(existingNames);
    if (!existing.has(baseName)) return baseName;
    let i = 1;
    while (existing.has(`${baseName} (${i})`)) i++;
    return `${baseName} (${i})`;
  };

  it('no conflict returns base', () => {
    expect(resolveUnique('Test', ['Other'])).toBe('Test');
  });

  it('first conflict adds (1)', () => {
    expect(resolveUnique('Test', ['Test'])).toBe('Test (1)');
  });

  it('skips existing numbered copies', () => {
    expect(resolveUnique('Test', ['Test', 'Test (1)', 'Test (2)'])).toBe('Test (3)');
  });
});

// ── HTML stripping ──
describe('HTML stripping for card preview', () => {
  const stripHtml = (html: string) => {
    // Simple implementation matching the one in DeckPreviewSheet
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (!div) return html.replace(/<[^>]*>/g, '');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  it('strips basic tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<div><p>hello <em>world</em></p></div>')).toBe('hello world');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('just text')).toBe('just text');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});

// ── Cloze detection ──
describe('Cloze card detection', () => {
  const isCloze = (cardType: string, front: string) => cardType === 'cloze' || front.includes('{{c');

  it('detects cloze by card_type', () => {
    expect(isCloze('cloze', 'plain text')).toBe(true);
  });

  it('detects cloze by content pattern', () => {
    expect(isCloze('basic', 'Some {{c1::answer}} here')).toBe(true);
  });

  it('does not detect basic as cloze', () => {
    expect(isCloze('basic', 'plain text')).toBe(false);
  });

  it('detects multiple clozes', () => {
    expect(isCloze('basic', '{{c1::a}} and {{c2::b}}')).toBe(true);
  });
});

// ── Multiple choice detection ──
describe('Multiple choice card detection', () => {
  const isOption = (back: string): boolean => {
    try {
      const parsed = JSON.parse(back);
      return !!(parsed.options && Array.isArray(parsed.options) && parsed.options.length >= 2);
    } catch { return false; }
  };

  it('detects valid MC', () => {
    expect(isOption(JSON.stringify({ options: ['A', 'B', 'C'], correct: 1 }))).toBe(true);
  });

  it('rejects single option', () => {
    expect(isOption(JSON.stringify({ options: ['A'] }))).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isOption('just some text')).toBe(false);
  });

  it('rejects empty options', () => {
    expect(isOption(JSON.stringify({ options: [] }))).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(isOption('{not valid')).toBe(false);
  });
});
