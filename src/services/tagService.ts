/**
 * Service layer for tag CRUD operations.
 * Supports hierarchy (parent_id), synonyms, and semantic search.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Tag } from '@/types/tag';

// ---- Hierarchy helpers ----

export interface TagTreeNode extends Tag {
  children: TagTreeNode[];
  /** Full path label, e.g. "Medicina > Cardiologia > Hipertensão" */
  pathLabel: string;
}

/** Build a flat list into a tree structure. */
function buildTree(tags: Tag[], parentId: string | null = null, prefix = ''): TagTreeNode[] {
  return tags
    .filter(t => t.parent_id === parentId)
    .sort((a, b) => b.usage_count - a.usage_count)
    .map(t => {
      const pathLabel = prefix ? `${prefix} > ${t.name}` : t.name;
      return {
        ...t,
        pathLabel,
        children: buildTree(tags, t.id, pathLabel),
      };
    });
}

/** Flatten a tree back to a list preserving path labels. */
function flattenTree(nodes: TagTreeNode[]): TagTreeNode[] {
  const result: TagTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    result.push(...flattenTree(node.children));
  }
  return result;
}

/** Get all tags as a tree. */
export async function getTagTree(): Promise<TagTreeNode[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .is('merged_into_id', null)
    .order('usage_count', { ascending: false });
  if (error) throw error;
  return buildTree(data ?? []);
}

/** Get flat list with path labels for autocomplete. */
export async function getTagsFlat(): Promise<TagTreeNode[]> {
  const tree = await getTagTree();
  return flattenTree(tree);
}

/** Get children of a specific tag. */
export async function getTagChildren(parentId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('parent_id', parentId)
    .is('merged_into_id', null)
    .order('usage_count', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Get all descendant IDs of a tag (for inclusive filtering). */
export async function getDescendantIds(tagId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, parent_id')
    .is('merged_into_id', null);
  if (error) throw error;
  const all = data ?? [];
  const result: string[] = [tagId];
  const queue = [tagId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const t of all) {
      if (t.parent_id === current && !result.includes(t.id)) {
        result.push(t.id);
        queue.push(t.id);
      }
    }
  }
  return result;
}

// ---- Search (with synonym support) ----

/** Search tags by name AND synonyms with fuzzy matching, ordered by usage. */
export async function searchTags(query: string, limit = 20): Promise<TagTreeNode[]> {
  // Fetch all non-merged tags to support hierarchy + synonym search
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .is('merged_into_id', null)
    .order('usage_count', { ascending: false })
    .limit(200);
  if (error) throw error;
  const all = (data ?? []) as Tag[];

  if (!query.trim()) {
    const tree = buildTree(all);
    return flattenTree(tree).slice(0, limit);
  }

  const q = query.toLowerCase();

  // Match by name or synonyms
  const matched = all.filter(t => {
    if (t.name.toLowerCase().includes(q)) return true;
    const synonyms = (t as any).synonyms as string[] | undefined;
    if (synonyms && synonyms.some((s: string) => s.toLowerCase().includes(q))) return true;
    return false;
  });

  // Build tree from matched + their ancestors
  const matchedIds = new Set(matched.map(t => t.id));
  // Add ancestors for context
  const withAncestors = new Set(matchedIds);
  for (const t of matched) {
    let parentId = t.parent_id;
    while (parentId) {
      withAncestors.add(parentId);
      const parent = all.find(p => p.id === parentId);
      parentId = parent?.parent_id ?? null;
    }
  }

  const subset = all.filter(t => withAncestors.has(t.id));
  const tree = buildTree(subset);
  const flat = flattenTree(tree);
  
  // Prioritize direct matches
  return flat
    .sort((a, b) => {
      const aMatch = matchedIds.has(a.id) ? 1 : 0;
      const bMatch = matchedIds.has(b.id) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      return b.usage_count - a.usage_count;
    })
    .slice(0, limit);
}

/** Create a new tag. Returns the created tag. */
export async function createTag(name: string, userId: string, parentId?: string): Promise<Tag> {
  const slug = generateSlug(name);
  
  const { data: existing } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  
  if (existing) return existing as Tag;

  const insertData: any = { name: name.trim(), slug, created_by: userId };
  if (parentId) insertData.parent_id = parentId;

  const { data, error } = await supabase
    .from('tags')
    .insert(insertData)
    .select()
    .single();
  if (error) throw error;
  return data as Tag;
}

/** Get tags for a specific deck. */
export async function getDeckTags(deckId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('deck_tags')
    .select('tag_id, tags(*)')
    .eq('deck_id', deckId);
  if (error) throw error;
  return (data ?? []).map((dt: any) => dt.tags).filter(Boolean);
}

/** Get tags for a specific card. */
export async function getCardTags(cardId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('card_tags')
    .select('tag_id, tags(*)')
    .eq('card_id', cardId);
  if (error) throw error;
  return (data ?? []).map((ct: any) => ct.tags).filter(Boolean);
}

/** Add a tag to a deck. */
export async function addDeckTag(deckId: string, tagId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('deck_tags')
    .insert({ deck_id: deckId, tag_id: tagId, added_by: userId });
  if (error && !error.message.includes('duplicate')) throw error;
}

/** Remove a tag from a deck. */
export async function removeDeckTag(deckId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('deck_tags')
    .delete()
    .eq('deck_id', deckId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

/** Add a tag to a card. */
export async function addCardTag(cardId: string, tagId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('card_tags')
    .insert({ card_id: cardId, tag_id: tagId, added_by: userId });
  if (error && !error.message.includes('duplicate')) throw error;
}

/** Remove a tag from a card. */
export async function removeCardTag(cardId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('card_tags')
    .delete()
    .eq('card_id', cardId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

/** Get all tags (for dashboard). */
export async function getAllTags(limit = 100): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .is('merged_into_id', null)
    .order('usage_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Get only tags that are linked to at least one PUBLIC deck (for marketplace filters). */
export async function getDeckOnlyTags(limit = 50): Promise<Tag[]> {
  // Only fetch tags from public decks so the marketplace filter chips are relevant
  const { data: publicDeckIds } = await supabase
    .from('decks')
    .select('id')
    .eq('is_public', true)
    .limit(500);
  
  if (!publicDeckIds || publicDeckIds.length === 0) return [];
  
  const ids = publicDeckIds.map(d => d.id);
  const { data, error } = await supabase
    .from('deck_tags')
    .select('tag_id, tags(*)')
    .in('deck_id', ids);
  if (error) throw error;
  
  // Deduplicate and extract unique tags
  const tagMap = new Map<string, Tag>();
  (data ?? []).forEach((dt: any) => {
    if (dt.tags && !dt.tags.merged_into_id && !tagMap.has(dt.tags.id)) {
      tagMap.set(dt.tags.id, dt.tags as Tag);
    }
  });
  
  // Sort: official first, then by usage_count desc
  return Array.from(tagMap.values())
    .sort((a, b) => {
      if (a.is_official !== b.is_official) return a.is_official ? -1 : 1;
      return b.usage_count - a.usage_count;
    })
    .slice(0, limit);
}

/** Get tags for multiple decks at once (batch). */
export async function getDeckTagsBatch(deckIds: string[]): Promise<Record<string, Tag[]>> {
  if (deckIds.length === 0) return {};
  const { data, error } = await supabase
    .from('deck_tags')
    .select('deck_id, tag_id, tags(*)')
    .in('deck_id', deckIds);
  if (error) throw error;
  
  const result: Record<string, Tag[]> = {};
  (data ?? []).forEach((dt: any) => {
    if (!dt.tags) return;
    if (!result[dt.deck_id]) result[dt.deck_id] = [];
    result[dt.deck_id].push(dt.tags);
  });
  return result;
}


/** Merge tags (admin only). Reassigns all associations from source to target. */
export async function mergeTags(sourceId: string, targetId: string): Promise<void> {
  const { data: deckAssocs } = await supabase
    .from('deck_tags')
    .select('deck_id')
    .eq('tag_id', sourceId);
  
  for (const assoc of (deckAssocs ?? [])) {
    await supabase.from('deck_tags')
      .upsert({ deck_id: assoc.deck_id, tag_id: targetId, added_by: null }, { onConflict: 'deck_id,tag_id' });
  }
  await supabase.from('deck_tags').delete().eq('tag_id', sourceId);

  const { data: cardAssocs } = await supabase
    .from('card_tags')
    .select('card_id')
    .eq('tag_id', sourceId);
  
  for (const assoc of (cardAssocs ?? [])) {
    await supabase.from('card_tags')
      .upsert({ card_id: assoc.card_id, tag_id: targetId, added_by: null }, { onConflict: 'card_id,tag_id' });
  }
  await supabase.from('card_tags').delete().eq('tag_id', sourceId);

  await supabase.from('tags').update({ merged_into_id: targetId }).eq('id', sourceId);
}

/** Update tag (admin). */
export async function updateTag(id: string, updates: { name?: string; is_official?: boolean; description?: string; parent_id?: string | null; synonyms?: string[] }): Promise<void> {
  const { error } = await supabase.from('tags').update(updates).eq('id', id);
  if (error) throw error;
}

/** Delete tag (admin). */
export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) throw error;
}

// ---- Helpers ----

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
