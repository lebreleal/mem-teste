/**
 * Service layer for PublicDeckPreview page.
 * Abstracts all Supabase interactions.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Deck Info ──

export async function fetchPublicDeckInfo(deckId: string) {
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, is_public, updated_at, user_id')
    .eq('id', deckId)
    .single();
  if (error) throw error;

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', data.user_id)
    .single();

  return { ...data, owner_name: profile?.name ?? 'Criador' };
}

// ── Cards ──

export async function fetchDeckSubtreeCards(deckId: string) {
  const allSubtreeIds = new Set<string>([deckId]);
  let parentIds = [deckId];
  while (parentIds.length > 0) {
    const { data: children } = await supabase
      .from('decks')
      .select('id, parent_deck_id')
      .in('parent_deck_id', parentIds);
    const newChildren = (children ?? []).filter((c: any) => !allSubtreeIds.has(c.id));
    if (newChildren.length === 0) break;
    newChildren.forEach((c: any) => allSubtreeIds.add(c.id));
    parentIds = newChildren.map((c: any) => c.id);
  }

  const subtreeIds = [...allSubtreeIds];
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .in('deck_id', subtreeIds)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

// ── Suggestion Count ──

export async function fetchDeckSuggestionCount(deckId: string): Promise<number> {
  const { count } = await supabase
    .from('deck_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);
  return count ?? 0;
}

// ── Turma Deck Link ──

export async function fetchTurmaDeckLink(deckId: string) {
  const { data, error } = await supabase
    .from('turma_decks')
    .select('id, turma_id, subject_id, lesson_id, content_folder_id')
    .eq('deck_id', deckId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Lesson Files ──

export async function fetchTurmaDeckFiles(lessonId: string) {
  const { data, error } = await supabase
    .from('turma_lesson_files')
    .select('id, file_name, file_url, file_size, file_type, created_at')
    .eq('lesson_id', lessonId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Exams ──

export async function fetchTurmaDeckExams(turmaId: string, lessonId: string) {
  const { data, error } = await supabase
    .from('turma_exams')
    .select('id, title, description, total_questions, time_limit_seconds, created_at, is_published')
    .eq('turma_id', turmaId)
    .eq('lesson_id', lessonId)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Membership Check ──

export async function checkTurmaMembership(turmaId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('turma_members')
    .select('id')
    .eq('turma_id', turmaId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// ── Follow Check ──

export async function checkDeckFollowing(params: {
  deckId: string;
  userId: string;
  turmaDeckId: string | null;
  deckName: string;
}): Promise<boolean> {
  const { deckId, userId, turmaDeckId, deckName } = params;

  if (turmaDeckId) {
    const { data } = await supabase
      .from('decks')
      .select('id')
      .eq('user_id', userId)
      .eq('source_turma_deck_id', turmaDeckId)
      .limit(1)
      .maybeSingle();
    return !!data;
  }

  const { data: listing } = await supabase
    .from('marketplace_listings')
    .select('id')
    .eq('deck_id', deckId)
    .eq('is_published', true)
    .maybeSingle();
  if (listing) {
    const { data } = await supabase
      .from('decks')
      .select('id')
      .eq('user_id', userId)
      .eq('source_listing_id', listing.id)
      .limit(1)
      .maybeSingle();
    return !!data;
  }

  const { data } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('is_live_deck', true)
    .eq('name', deckName)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ── Join Turma ──

export async function joinTurma(turmaId: string, userId: string) {
  const { error } = await supabase.from('turma_members').insert({
    turma_id: turmaId,
    user_id: userId,
    role: 'member',
  } as any);
  if (error) throw error;
}

// ── Copy Deck (Follow) ──

async function copySingleDeck(params: {
  sourceDeckId: string;
  deckName: string;
  userId: string;
  parentDeckId: string | null;
  sourceTurmaDeckId: string | null;
  folderId: string | null;
  communityId: string | null;
}) {
  const { sourceDeckId, deckName, userId, parentDeckId, sourceTurmaDeckId, folderId, communityId } = params;
  const { data: srcDeck } = await supabase.from('decks').select('algorithm_mode, daily_new_limit, daily_review_limit').eq('id', sourceDeckId).single();
  const sd = srcDeck as any;
  const insertData: any = {
    name: deckName, user_id: userId, is_public: false, is_live_deck: true,
    folder_id: folderId, parent_deck_id: parentDeckId,
    algorithm_mode: sd?.algorithm_mode ?? 'fsrs',
    daily_new_limit: sd?.daily_new_limit ?? 20,
    daily_review_limit: sd?.daily_review_limit ?? 9999,
  };
  if (sourceTurmaDeckId) insertData.source_turma_deck_id = sourceTurmaDeckId;
  if (communityId) insertData.community_id = communityId;

  const { data: newDeck, error } = await supabase.from('decks').insert(insertData).select('id').single();
  if (error) throw error;

  if (newDeck) {
    await copyCardsInBatches(sourceDeckId, newDeck.id);
  }
  return newDeck;
}

async function copyCardsInBatches(sourceDeckId: string, targetDeckId: string) {
  const BATCH = 500;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: cards } = await supabase
      .from('cards')
      .select('front_content, back_content, card_type')
      .eq('deck_id', sourceDeckId)
      .range(offset, offset + BATCH - 1)
      .order('created_at', { ascending: true });
    if (!cards || cards.length === 0) break;
    await supabase.from('cards').insert(cards.map((c: any) => ({
      deck_id: targetDeckId, front_content: c.front_content,
      back_content: c.back_content, card_type: c.card_type ?? 'basic',
    })) as any);
    if (cards.length < BATCH) hasMore = false;
    else offset += BATCH;
  }
}

export async function followDeckWithHierarchy(params: {
  deckId: string;
  deckName: string;
  userId: string;
  turmaDeck: { id: string; turma_id: string; subject_id?: string | null } | null;
}) {
  const { deckId, deckName, userId, turmaDeck } = params;

  if (!turmaDeck) {
    // Non-turma public deck
    const insertData: any = {
      name: deckName, user_id: userId, is_public: false, is_live_deck: true,
    };
    const { data: listing } = await supabase
      .from('marketplace_listings').select('id')
      .eq('deck_id', deckId).eq('is_published', true).maybeSingle();
    if (listing) insertData.source_listing_id = listing.id;

    if (!listing) {
      const { data: srcDeck } = await supabase.from('decks').select('user_id').eq('id', deckId).single();
      if (srcDeck) {
        const { data: ownerMembership } = await supabase
          .from('turma_members')
          .select('turma_id')
          .eq('user_id', (srcDeck as any).user_id)
          .limit(1)
          .maybeSingle();
        if (ownerMembership) insertData.community_id = (ownerMembership as any).turma_id;
      }
    }

    const { data: newDeck, error } = await supabase.from('decks').insert(insertData).select('id').single();
    if (error) throw error;
    if (newDeck) {
      await copyCardsInBatches(deckId, newDeck.id);
    }
    return;
  }

  // Turma deck: copy with hierarchy
  const mainDeck = await copySingleDeck({
    sourceDeckId: deckId, deckName, userId,
    parentDeckId: null, sourceTurmaDeckId: turmaDeck.id,
    folderId: null, communityId: turmaDeck.turma_id,
  });

  if (mainDeck) {
    const { data: childTurmaDeckRows } = await supabase
      .from('turma_decks')
      .select('id, deck_id')
      .eq('turma_id', turmaDeck.turma_id);

    const { data: childDecks } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id')
      .eq('parent_deck_id', deckId);

    if (childDecks?.length) {
      for (const child of childDecks) {
        const childTd = (childTurmaDeckRows ?? []).find((r: any) => r.deck_id === child.id);
        await copySingleDeck({
          sourceDeckId: child.id, deckName: child.name, userId,
          parentDeckId: mainDeck.id, sourceTurmaDeckId: childTd?.id ?? null,
          folderId: null, communityId: turmaDeck.turma_id,
        });
      }
    }
  }
}

// ── File Upload ──

export async function getOrCreateLessonForDeck(params: {
  turmaDeck: { id: string; turma_id: string; lesson_id: string | null; subject_id: string | null };
  deckName: string;
  userId: string;
}): Promise<string> {
  const { turmaDeck, deckName, userId } = params;
  if (turmaDeck.lesson_id) return turmaDeck.lesson_id;
  const { data, error } = await supabase.from('turma_lessons' as any).insert({
    turma_id: turmaDeck.turma_id, subject_id: turmaDeck.subject_id ?? null,
    name: deckName || 'Conteúdo', created_by: userId, is_published: true,
  } as any).select().single();
  if (error) throw error;
  await supabase.from('turma_decks').update({ lesson_id: (data as any).id }).eq('id', turmaDeck.id);
  return (data as any).id;
}

export async function uploadLessonFile(params: {
  file: File;
  userId: string;
  turmaId: string;
  lessonId: string;
}) {
  const { file, userId, turmaId, lessonId } = params;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${userId}/${turmaId}/${lessonId}/${Date.now()}_${safeName}`;
  const { error: uploadError } = await supabase.storage.from('lesson-files').upload(filePath, file);
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from('lesson-files').getPublicUrl(filePath);
  await supabase.from('turma_lesson_files' as any).insert({
    lesson_id: lessonId, turma_id: turmaId, file_name: file.name,
    file_url: urlData.publicUrl, file_size: file.size, file_type: file.type, uploaded_by: userId,
  } as any);
}

export async function deleteLessonFile(fileId: string) {
  const { error } = await supabase.from('turma_lesson_files' as any).delete().eq('id', fileId);
  if (error) throw error;
}

// ── Suggestions ──

export async function fetchSuggestionComments(suggestionId: string) {
  const { data, error } = await supabase
    .from('suggestion_comments')
    .select('id, content, created_at, user_id')
    .eq('suggestion_id', suggestionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));
  return data.map(c => ({ ...c, user_name: nameMap.get(c.user_id) ?? 'Usuário' }));
}

export async function insertSuggestionComment(suggestionId: string, userId: string, content: string) {
  const { error } = await supabase.from('suggestion_comments').insert({
    suggestion_id: suggestionId,
    user_id: userId,
    content,
  } as any);
  if (error) throw error;
}

export async function fetchDeckSuggestions(deckId: string, userId: string | undefined) {
  const { data, error } = await supabase
    .from('deck_suggestions')
    .select('id, status, rationale, created_at, suggester_user_id, card_id, suggested_content, suggestion_type, suggested_tags, content_status, tags_status')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map(s => s.suggester_user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  const cardIds = data.map(s => s.card_id).filter(Boolean) as string[];
  const { data: cards } = cardIds.length > 0
    ? await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds)
    : { data: [] };
  const cardMap = new Map((cards ?? []).map(c => [c.id, c]));

  const suggestionIds = data.map(s => s.id);
  const { data: votes } = await supabase
    .from('suggestion_votes')
    .select('suggestion_id, vote, user_id')
    .in('suggestion_id', suggestionIds);
  
  const voteMap = new Map<string, { score: number; userVote: number }>();
  (votes ?? []).forEach((v: any) => {
    const existing = voteMap.get(v.suggestion_id) ?? { score: 0, userVote: 0 };
    existing.score += v.vote;
    if (v.user_id === userId) existing.userVote = v.vote;
    voteMap.set(v.suggestion_id, existing);
  });

  const { data: commentCounts } = await supabase
    .from('suggestion_comments')
    .select('suggestion_id')
    .in('suggestion_id', suggestionIds);
  const commentCountMap = new Map<string, number>();
  (commentCounts ?? []).forEach((c: any) => {
    commentCountMap.set(c.suggestion_id, (commentCountMap.get(c.suggestion_id) ?? 0) + 1);
  });

  return data.map(s => ({
    ...s,
    suggester_name: nameMap.get(s.suggester_user_id) ?? 'Usuário',
    original_front: s.card_id ? cardMap.get(s.card_id)?.front_content ?? null : null,
    original_back: s.card_id ? cardMap.get(s.card_id)?.back_content ?? null : null,
    vote_score: voteMap.get(s.id)?.score ?? 0,
    user_vote: voteMap.get(s.id)?.userVote ?? 0,
    comment_count: commentCountMap.get(s.id) ?? 0,
  }));
}

export async function voteSuggestion(suggestionId: string, userId: string, vote: number) {
  if (vote === 0) {
    await supabase.from('suggestion_votes').delete().eq('suggestion_id', suggestionId).eq('user_id', userId);
  } else {
    await supabase.from('suggestion_votes').upsert({
      suggestion_id: suggestionId,
      user_id: userId,
      vote,
    } as any, { onConflict: 'suggestion_id,user_id' });
  }
}
